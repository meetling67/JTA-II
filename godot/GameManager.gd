extends Node3D
class_name GameManager

## Attach this script to the root Node3D ("MainWorld") of your city scene.
## Handles:
## - 16s Intersection Traffic Light Cycle (EW vs NS Red/Yellow/Green)
## - Speed Limit (50 km/h), Red Light & Crash Wanted Level (1-3 Stars)
## - Police Patrol -> Pursuit assignment & Evasion / Busted resolution
## - Time of Day presets (JTA Dusk, Day, Sunset, Night)
## - Pause Menu (Esc) and City Reset

enum TimeOfDay { DUSK, DAY, SUNSET, NIGHT }
enum SignalColor { GREEN, YELLOW, RED }

signal hud_updated(snapshot: Dictionary)

@export_group("Law & Traffic Rules")
@export var speed_limit_kmh: float = 50.0
@export var speeding_threshold_kmh: float = 62.0
@export var evasion_clear_seconds: float = 10.0
@export var evade_distance_meters: float = 56.0

@export_group("City Scene References")
@export var intersection_centers: Array[Vector2] = [
	Vector2(-72, -28), Vector2(-24, -28), Vector2(24, -28), Vector2(72, -28),
	Vector2(-72, 12), Vector2(-24, 12), Vector2(24, 12), Vector2(72, 12),
	Vector2(-72, 54), Vector2(-24, 54), Vector2(24, 54), Vector2(72, 54),
]
@export var sun_light: DirectionalLight3D
@export var world_environment: WorldEnvironment
@export var siren_audio: AudioStreamPlayer
@export var dispatch_audio: AudioStreamPlayer

## Optional shared signal materials assigned to intersection traffic light bulbs
@export var ew_signal_materials: Array[StandardMaterial3D] = [] # [Red, Yellow, Green]
@export var ns_signal_materials: Array[StandardMaterial3D] = [] # [Red, Yellow, Green]

var player: Player = null
var ew_signal: SignalColor = SignalColor.GREEN
var ns_signal: SignalColor = SignalColor.RED

var elapsed_time: float = 0.0
var wanted_level: int = 0
var wanted_reason: String = ""
var speeding_duration: float = 0.0
var last_red_light_time: float = -10.0
var evade_timer: float = 0.0
var busted_hold_timer: float = 0.0
var current_tod: TimeOfDay = TimeOfDay.DUSK


func _ready() -> void:
	add_to_group("game_manager")
	process_mode = Node.PROCESS_MODE_ALWAYS
	player = get_tree().get_first_node_in_group("player") as Player

	if player:
		player.punched_pedestrian.connect(_on_player_punched_pedestrian)

	for node in get_tree().get_nodes_in_group("vehicles"):
		var car := node as Car
		if car:
			car.vehicle_crashed.connect(_on_vehicle_crashed)
			car.pedestrian_struck.connect(_on_pedestrian_struck)

	apply_time_of_day(current_tod)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		toggle_pause()


func _process(delta: float) -> void:
	if get_tree().paused:
		return

	elapsed_time += delta
	_update_traffic_signals()
	_step_law_enforcement(delta)
	_emit_hud_snapshot()


func toggle_pause() -> void:
	var paused: bool = not get_tree().paused
	get_tree().paused = paused
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE if paused else Input.MOUSE_MODE_CAPTURED)
	if siren_audio:
		siren_audio.stream_paused = paused


func reset_city() -> void:
	wanted_level = 0
	wanted_reason = ""
	speeding_duration = 0.0
	evade_timer = 0.0
	busted_hold_timer = 0.0
	get_tree().paused = false
	get_tree().reload_current_scene()


func _update_traffic_signals() -> void:
	var t: float = fmod(elapsed_time, 16.0)
	if t < 6.0:
		ew_signal = SignalColor.GREEN
		ns_signal = SignalColor.RED
	elif t < 8.0:
		ew_signal = SignalColor.YELLOW
		ns_signal = SignalColor.RED
	elif t < 14.0:
		ew_signal = SignalColor.RED
		ns_signal = SignalColor.GREEN
	else:
		ew_signal = SignalColor.RED
		ns_signal = SignalColor.YELLOW

	_apply_signal_materials(ew_signal_materials, ew_signal)
	_apply_signal_materials(ns_signal_materials, ns_signal)


func _apply_signal_materials(mats: Array[StandardMaterial3D], state: SignalColor) -> void:
	if mats.size() < 3:
		return
	mats[0].emission_energy_multiplier = 2.8 if state == SignalColor.RED else 0.08
	mats[1].emission_energy_multiplier = 2.8 if state == SignalColor.YELLOW else 0.08
	mats[2].emission_energy_multiplier = 2.8 if state == SignalColor.GREEN else 0.08


## Called by Car.gd NPC traffic to check if an upcoming intersection light is Red/Yellow.
func should_npc_stop_for_light(car_pos: Vector3, forward_dir: Vector3) -> bool:
	var is_ew: bool = abs(forward_dir.x) >= abs(forward_dir.z)
	var axis_sig: SignalColor = ew_signal if is_ew else ns_signal
	if axis_sig == SignalColor.GREEN:
		return false

	for inter in intersection_centers:
		var dx: float = inter.x - car_pos.x
		var dz: float = inter.y - car_pos.z
		var ahead: float = dx * forward_dir.x + dz * forward_dir.z
		var lateral: float = abs(-dx * forward_dir.z + dz * forward_dir.x)
		# Stop cleanly behind the crosswalk (7.8m..15.8m ahead of intersection center)
		if lateral < 6.8 and ahead > 7.8 and ahead < 15.8:
			return true
	return false


func _step_law_enforcement(delta: float) -> void:
	var driven_car: Car = player.driven_vehicle if player else null

	# 1. Monitor Speed Limit & Red-Light Running while driving
	if driven_car:
		var speed_kmh: float = abs(driven_car.forward_speed) * 3.6
		if speed_kmh > speeding_threshold_kmh:
			speeding_duration += delta
			if speeding_duration >= 1.25:
				raise_wanted(1, "Speeding (%d / %d km/h)" % [roundi(speed_kmh), roundi(speed_limit_kmh)])
				speeding_duration = 0.0
		else:
			speeding_duration = max(0.0, speeding_duration - delta * 1.5)

		if speed_kmh > 18.0 and (elapsed_time - last_red_light_time) > 4.0:
			for inter in intersection_centers:
				if abs(driven_car.global_position.x - inter.x) < 5.2 and abs(driven_car.global_position.z - inter.y) < 5.2:
					var driving_ew: bool = abs(sin(driven_car.yaw_angle)) >= abs(cos(driven_car.yaw_angle))
					var sig: SignalColor = ew_signal if driving_ew else ns_signal
					if sig == SignalColor.RED:
						last_red_light_time = elapsed_time
						raise_wanted(1, "Ran Red Light")
					break
	else:
		speeding_duration = 0.0

	# 2. Assign nearest Police Cruisers & evaluate Evasion / Busted timers
	var max_pursuers: int = min(3, wanted_level + 1) if wanted_level > 0 else 0
	var active_pursuers: int = 0
	var nearest_cop_dist: float = INF
	var p_pos: Vector3 = get_player_world_pos()

	for node in get_tree().get_nodes_in_group("vehicles"):
		var car := node as Car
		if not car or not car.is_police_unit or car == driven_car:
			continue
		if car.control_mode == Car.ControlMode.WRECKED:
			continue

		if wanted_level > 0 and active_pursuers < max_pursuers:
			car.control_mode = Car.ControlMode.POLICE_PURSUIT
			active_pursuers += 1
			var d: float = Vector2(car.global_position.x - p_pos.x, car.global_position.z - p_pos.z).length()
			nearest_cop_dist = min(nearest_cop_dist, d)
		elif car.control_mode == Car.ControlMode.POLICE_PURSUIT:
			car.control_mode = Car.ControlMode.TRAFFIC

	if wanted_level > 0:
		if siren_audio and not siren_audio.playing:
			siren_audio.play()

		if nearest_cop_dist > evade_distance_meters:
			evade_timer += delta
			if evade_timer >= evasion_clear_seconds:
				_clear_wanted("Evaded the Police!")
		else:
			evade_timer = max(0.0, evade_timer - delta * 2.0)

		var p_speed_kmh: float = Vector2(get_player_world_vel().x, get_player_world_vel().z).length() * 3.6
		if nearest_cop_dist < 4.8 and p_speed_kmh < 7.0:
			busted_hold_timer += delta
			if busted_hold_timer >= 2.6:
				if driven_car:
					driven_car.forward_speed = 0.0
					driven_car.velocity = Vector3.ZERO
				_clear_wanted("BUSTED! Citation issued")
		else:
			busted_hold_timer = max(0.0, busted_hold_timer - delta * 1.5)
	else:
		if siren_audio and siren_audio.playing:
			siren_audio.stop()


func raise_wanted(min_level: int, reason: String) -> void:
	var prev: int = wanted_level
	wanted_level = clampi(max(wanted_level, min_level), 0, 3)
	wanted_reason = reason
	evade_timer = 0.0
	if wanted_level > prev and dispatch_audio:
		dispatch_audio.play()


func _clear_wanted(reason: String) -> void:
	wanted_level = 0
	wanted_reason = reason
	evade_timer = 0.0
	busted_hold_timer = 0.0
	if siren_audio:
		siren_audio.stop()


func get_player_world_pos() -> Vector3:
	if player and player.driven_vehicle:
		return player.driven_vehicle.global_position
	return player.global_position if player else Vector3.ZERO


func get_player_world_vel() -> Vector3:
	if player and player.driven_vehicle:
		return player.driven_vehicle.velocity
	return player.velocity if player else Vector3.ZERO


func apply_time_of_day(tod: TimeOfDay) -> void:
	current_tod = tod
	if sun_light:
		match tod:
			TimeOfDay.DUSK:
				sun_light.light_color = Color(1.0, 0.56, 0.83)
				sun_light.light_energy = 1.6
			TimeOfDay.DAY:
				sun_light.light_color = Color(1.0, 0.95, 0.85)
				sun_light.light_energy = 2.15
			TimeOfDay.SUNSET:
				sun_light.light_color = Color(1.0, 0.61, 0.36)
				sun_light.light_energy = 1.85
			TimeOfDay.NIGHT:
				sun_light.light_color = Color(0.53, 0.71, 0.94)
				sun_light.light_energy = 0.62

	if world_environment and world_environment.environment:
		var env := world_environment.environment
		env.fog_enabled = true
		match tod:
			TimeOfDay.DUSK:
				env.fog_light_color = Color(0.27, 0.11, 0.39)
			TimeOfDay.DAY:
				env.fog_light_color = Color(0.66, 0.84, 0.94)
			TimeOfDay.SUNSET:
				env.fog_light_color = Color(0.86, 0.51, 0.36)
			TimeOfDay.NIGHT:
				env.fog_light_color = Color(0.04, 0.08, 0.15)


func _on_vehicle_crashed(_car: Car, other: Node3D, closing_speed: float) -> void:
	if other is Car and (other as Car).is_police_unit:
		raise_wanted(2, "Ramming Police Cruiser")
	elif closing_speed > 3.2:
		raise_wanted(1, "Reckless Collision")


func _on_pedestrian_struck(_car: Car, _ped: Node3D) -> void:
	raise_wanted(2, "Pedestrian Hit & Run")


func _on_player_punched_pedestrian(_ped: Node3D) -> void:
	raise_wanted(1, "Assault on Pedestrian")


func _emit_hud_snapshot() -> void:
	var driven := player.driven_vehicle if player else null
	var spd_kmh: int = roundi(abs(driven.forward_speed) * 3.6) if driven else roundi(Vector2(get_player_world_vel().x, get_player_world_vel().z).length() * 3.6)
	hud_updated.emit({
		"mode": "car" if driven else "foot",
		"vehicle_label": driven.vehicle_label if driven else "On Foot",
		"speed_kmh": spd_kmh,
		"speed_limit_kmh": speed_limit_kmh,
		"is_speeding": driven != null and spd_kmh > speeding_threshold_kmh,
		"wanted_level": wanted_level,
		"wanted_reason": wanted_reason,
		"evasion_ratio": clamp(evade_timer / evasion_clear_seconds, 0.0, 1.0) if wanted_level > 0 else 0.0,
	})
