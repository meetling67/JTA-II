extends CharacterBody3D
class_name Car

## Attach this script to each Vehicle root CharacterBody3D node ("Car", "Supercar", "PoliceCar", "Motorcycle").
## Required/optional child nodes:
## - CollisionShape3D (BoxShape3D matching vehicle dimensions)
## - Chassis (Node3D) -> optional DoorPivot, SteeringWheelPivot, SeatMarker, CockpitEye, LightbarRed, LightbarBlue
## - Wheels: FrontLeftSteer (Node3D) -> SpinMesh, FrontRightSteer -> SpinMesh, RearLeftSpin, RearRightSpin
## - ChasePivot (Node3D) -> SpringArm3D -> ChaseCamera (Camera3D)
## - MirrorCamera (Camera3D inside a SubViewport for live rearview mirror)

enum VehicleKind {
	SUPERCAR,
	CONVERTIBLE,
	COUPE,
	SEDAN,
	SUV,
	TRUCK,
	POLICE,
	MOTORCYCLE,
}

enum ControlMode {
	PARKED,
	PLAYER,
	TRAFFIC,
	POLICE_PURSUIT,
	WRECKED,
}

signal vehicle_crashed(car: Car, other: Node3D, closing_speed_ms: float)
signal pedestrian_struck(car: Car, ped: Node3D)
signal police_rammed_player(police_car: Car)

@export_group("Vehicle Specs")
@export var vehicle_kind: VehicleKind = VehicleKind.SEDAN
@export var vehicle_label: String = "City Sedan"
@export var control_mode: ControlMode = ControlMode.PARKED
@export var vehicle_width: float = 1.9
@export var vehicle_length: float = 4.5
@export var traffic_cruise_speed: float = 9.0

@export_group("Traffic Patrol Route")
@export var patrol_waypoints: Array[Vector3] = []

@onready var chassis: Node3D = get_node_or_null("Chassis")
@onready var door_pivot: Node3D = get_node_or_null("Chassis/DoorPivot")
@onready var steering_wheel: Node3D = get_node_or_null("Chassis/SteeringWheelPivot")
@onready var cockpit_eye: Marker3D = get_node_or_null("Chassis/CockpitEye")
@onready var chase_pivot: Node3D = get_node_or_null("ChasePivot")
@onready var chase_camera: Camera3D = get_node_or_null("ChasePivot/SpringArm3D/ChaseCamera")
@onready var cockpit_camera: Camera3D = get_node_or_null("Chassis/CockpitCamera")
@onready var mirror_camera: Camera3D = get_node_or_null("Chassis/MirrorCamera")

@onready var fl_steer: Node3D = get_node_or_null("FrontLeftSteer")
@onready var fr_steer: Node3D = get_node_or_null("FrontRightSteer")
@onready var wheel_spin_nodes: Array[Node] = [
	get_node_or_null("FrontLeftSteer/WheelMesh"),
	get_node_or_null("FrontRightSteer/WheelMesh"),
	get_node_or_null("RearLeftSpin"),
	get_node_or_null("RearRightSpin"),
]
@onready var taillight_mesh: MeshInstance3D = get_node_or_null("Chassis/Taillight")
@onready var lightbar_red: MeshInstance3D = get_node_or_null("Chassis/LightbarRed")
@onready var lightbar_blue: MeshInstance3D = get_node_or_null("Chassis/LightbarBlue")

var game_manager: Node = null
var driver: Player = null

var forward_speed: float = 0.0
var steer_angle: float = 0.0
var wheel_spin: float = 0.0
var lean_angle: float = 0.0
var yaw_angle: float = 0.0

var cockpit_view_active: bool = false
var last_manual_look_time: float = -10.0
var elapsed_time: float = 0.0

var waypoint_index: int = 0
var wreck_timer: float = 0.0
var ram_cooldown: float = 0.0
var is_police_unit: bool = false


func _ready() -> void:
	add_to_group("vehicles")
	yaw_angle = rotation.y
	is_police_unit = (vehicle_kind == VehicleKind.POLICE)
	game_manager = get_tree().get_first_node_in_group("game_manager")


func _physics_process(delta: float) -> void:
	elapsed_time += delta
	if ram_cooldown > 0.0:
		ram_cooldown = max(0.0, ram_cooldown - delta)

	_update_police_lightbar()

	match control_mode:
		ControlMode.PLAYER:
			if Input.is_action_just_pressed("toggle_camera"):
				toggle_camera_view()
			_step_player_driving(delta)
			_update_player_camera(delta)
		ControlMode.TRAFFIC:
			_step_npc_traffic(delta)
		ControlMode.POLICE_PURSUIT:
			_step_police_pursuit(delta)
		ControlMode.WRECKED:
			_step_wrecked(delta)
		ControlMode.PARKED:
			velocity.x = _damp(velocity.x, 0.0, 4.0, delta)
			velocity.z = _damp(velocity.z, 0.0, 4.0, delta)
			if not is_on_floor():
				velocity.y -= 16.5 * delta
			move_and_slide()


func _get_max_speed_and_accel() -> Vector2:
	match vehicle_kind:
		VehicleKind.SUPERCAR:
			return Vector2(46.0, 22.5)
		VehicleKind.CONVERTIBLE:
			return Vector2(40.0, 18.0)
		VehicleKind.POLICE:
			return Vector2(41.0, 19.0)
		VehicleKind.MOTORCYCLE:
			return Vector2(39.0, 19.5)
		VehicleKind.COUPE:
			return Vector2(37.0, 16.5)
		VehicleKind.TRUCK:
			return Vector2(25.0, 9.5)
		_:
			return Vector2(32.0, 13.5)


func _step_player_driving(delta: float) -> void:
	var is_bike: bool = (vehicle_kind == VehicleKind.MOTORCYCLE)
	var fwd_in: float = 1.0 if Input.is_action_pressed("move_forward") else 0.0
	var rev_in: float = 1.0 if Input.is_action_pressed("move_backward") else 0.0
	var handbrake: bool = Input.is_action_pressed("handbrake")
	var steer_in: float = Input.get_axis("move_right", "move_left")

	var specs: Vector2 = _get_max_speed_and_accel()
	var max_speed: float = specs.x
	var accel_force: float = specs.y

	var throttle: float = 0.0
	var braking: bool = handbrake

	if fwd_in > 0.1:
		if forward_speed < -0.8:
			braking = true
		else:
			throttle = 1.0
	elif rev_in > 0.1:
		if forward_speed > 0.8:
			braking = true
		else:
			var max_rev: float = -0.9 if is_bike else -11.0
			if forward_speed > max_rev:
				throttle = -0.25 if is_bike else -0.55

	if braking:
		var decel: float = (30.0 if handbrake else 24.0) * delta
		if abs(forward_speed) <= decel:
			forward_speed = 0.0
		else:
			forward_speed -= sign(forward_speed) * decel
	elif throttle != 0.0:
		forward_speed = clamp(forward_speed + throttle * accel_force * delta, -11.0, max_speed)
	else:
		forward_speed = _damp(forward_speed, 0.0, 1.35, delta)

	_set_taillight_intensity(2.4 if braking else 0.45)

	# Steering & Ackermann bicycle kinematics
	var max_steer: float = deg_to_rad(26.0 if is_bike else 30.0)
	var speed_factor: float = clamp(1.0 - abs(forward_speed) / 48.0, 0.42, 1.0)
	steer_angle = _damp(steer_angle, steer_in * max_steer * speed_factor, 9.0, delta)

	var wheelbase: float = 1.46 if is_bike else vehicle_length * 0.62
	if abs(forward_speed) > 0.08:
		var turn_rate: float = (forward_speed / wheelbase) * tan(steer_angle)
		var drift_boost: float = 1.42 if (handbrake and abs(forward_speed) > 6.0) else 1.0
		yaw_angle += turn_rate * drift_boost * delta
		rotation.y = yaw_angle

	var fwd_vec: Vector3 = Vector3(sin(yaw_angle), 0.0, cos(yaw_angle))
	var grip: float = 2.8 if handbrake else (10.5 if is_bike else 8.2)
	velocity.x = _damp(velocity.x, fwd_vec.x * forward_speed, grip, delta)
	velocity.z = _damp(velocity.z, fwd_vec.z * forward_speed, grip, delta)

	if not is_on_floor():
		velocity.y -= 16.5 * delta

	move_and_slide()
	_handle_slide_collisions()

	# Body roll / motorcycle turn lean
	if chassis:
		if is_bike:
			var target_lean: float = -steer_in * deg_to_rad(14.0) * clamp(abs(forward_speed) / 10.0, 0.0, 1.0)
			lean_angle = _damp(lean_angle, target_lean, 8.0, delta)
			chassis.rotation.z = lean_angle
		else:
			var roll: float = -steer_in * clamp(abs(forward_speed) / 28.0, 0.0, 1.0) * 0.045
			var pitch: float = 0.03 if braking else (-0.02 if throttle > 0.0 else 0.0)
			chassis.rotation.z = _damp(chassis.rotation.z, roll, 8.0, delta)
			chassis.rotation.x = _damp(chassis.rotation.x, pitch, 8.0, delta)

	_animate_wheels_and_steering(steer_in, delta)


func _step_npc_traffic(delta: float) -> void:
	if patrol_waypoints.is_empty():
		return

	var target_pt: Vector3 = patrol_waypoints[waypoint_index]
	var to_target: Vector3 = target_pt - global_position
	to_target.y = 0.0
	if to_target.length() < 2.2:
		waypoint_index = (waypoint_index + 1) % patrol_waypoints.size()
		target_pt = patrol_waypoints[waypoint_index]
		to_target = target_pt - global_position
		to_target.y = 0.0

	var dir: Vector3 = to_target.normalized()
	var speed_scale: float = 1.0

	# 1. Obey intersection traffic lights (EW vs NS Red/Yellow stop lines)
	if game_manager and game_manager.has_method("should_npc_stop_for_light"):
		if game_manager.call("should_npc_stop_for_light", global_position, dir):
			speed_scale = 0.0

	# 2. Vehicle spacing ahead
	if speed_scale > 0.0:
		for node in get_tree().get_nodes_in_group("vehicles"):
			var other := node as Node3D
			if other == self or not other:
				continue
			var diff: Vector3 = other.global_position - global_position
			diff.y = 0.0
			var dist: float = diff.length()
			if dist < 9.2 and dist > 0.1 and diff.normalized().dot(dir) > 0.72:
				speed_scale = 0.0 if dist < 5.8 else 0.35
				break

	var target_spd: float = traffic_cruise_speed * speed_scale
	forward_speed = _damp(forward_speed, target_spd, 7.5 if speed_scale == 0.0 else 4.5, delta)
	_set_taillight_intensity(2.1 if speed_scale < 0.5 else 0.4)

	yaw_angle = _damp_angle(yaw_angle, atan2(dir.x, dir.z), 6.0, delta)
	rotation.y = yaw_angle
	velocity.x = dir.x * forward_speed
	velocity.z = dir.z * forward_speed
	if not is_on_floor():
		velocity.y -= 16.5 * delta

	move_and_slide()
	_animate_wheels_and_steering(0.0, delta)


func _step_police_pursuit(delta: float) -> void:
	if not game_manager:
		return
	var target_pos: Vector3 = game_manager.call("get_player_world_pos")
	var target_vel: Vector3 = game_manager.call("get_player_world_vel")
	var wanted_lvl: int = game_manager.get("wanted_level")

	# Lead moving target + simple forward/left/right collision probe avoidance
	var aim_pos: Vector3 = target_pos + target_vel * 0.45
	var to_aim: Vector3 = aim_pos - global_position
	to_aim.y = 0.0
	var dist_to_player: float = Vector2(target_pos.x - global_position.x, target_pos.z - global_position.z).length()

	var desired_yaw: float = atan2(to_aim.x, to_aim.z)
	if _is_probe_blocked(yaw_angle, 5.6):
		if not _is_probe_blocked(yaw_angle + 0.72, 5.6):
			desired_yaw = yaw_angle + 1.05
		elif not _is_probe_blocked(yaw_angle - 0.72, 5.6):
			desired_yaw = yaw_angle - 1.05
		else:
			desired_yaw = yaw_angle + 1.45

	var angle_diff: float = wrapf(desired_yaw - yaw_angle, -PI, PI)
	var max_pursuit_spd: float = 28.0 + float(wanted_lvl) * 5.5
	var desired_spd: float = 4.0 if dist_to_player < 4.5 else (12.0 if abs(angle_diff) > 1.45 else max_pursuit_spd)

	forward_speed = _damp(forward_speed, desired_spd, 3.2, delta)
	var max_steer: float = deg_to_rad(34.0)
	steer_angle = _damp(steer_angle, clamp(angle_diff * 1.15, -max_steer, max_steer), 10.0, delta)

	var wheelbase: float = vehicle_length * 0.6
	yaw_angle += (forward_speed / wheelbase) * tan(steer_angle) * delta
	rotation.y = yaw_angle

	var fwd_vec: Vector3 = Vector3(sin(yaw_angle), 0.0, cos(yaw_angle))
	velocity.x = _damp(velocity.x, fwd_vec.x * forward_speed, 6.8, delta)
	velocity.z = _damp(velocity.z, fwd_vec.z * forward_speed, 6.8, delta)
	if not is_on_floor():
		velocity.y -= 16.5 * delta

	move_and_slide()

	# Ram / PIT impulse against player car
	if ram_cooldown <= 0.0 and dist_to_player < vehicle_width * 1.15:
		for i in get_slide_collision_count():
			var col := get_slide_collision(i)
			var collider := col.get_collider()
			if collider is Car and (collider as Car).control_mode == ControlMode.PLAYER:
				var p_car := collider as Car
				var push: Vector3 = (p_car.global_position - global_position).normalized()
				p_car.velocity += push * 7.5
				p_car.yaw_angle += randf_range(-0.22, 0.22)
				forward_speed *= 0.55
				ram_cooldown = 0.85
				police_rammed_player.emit(self)
				break

	if chassis:
		chassis.rotation.z = _damp(chassis.rotation.z, -steer_angle * 0.14, 8.0, delta)
	_animate_wheels_and_steering(steer_angle, delta)


func _step_wrecked(delta: float) -> void:
	wreck_timer -= delta
	velocity.x = _damp(velocity.x, 0.0, 2.2, delta)
	velocity.z = _damp(velocity.z, 0.0, 2.2, delta)
	if not is_on_floor():
		velocity.y -= 16.5 * delta
	move_and_slide()

	if vehicle_kind == VehicleKind.MOTORCYCLE and chassis:
		lean_angle = _damp(lean_angle, PI * 0.42, 5.0, delta)
		chassis.rotation.z = lean_angle

	if is_police_unit and wreck_timer <= 0.0:
		control_mode = ControlMode.TRAFFIC


func _handle_slide_collisions() -> void:
	var p_speed: float = Vector2(velocity.x, velocity.z).length()
	if p_speed < 2.8:
		return

	for i in get_slide_collision_count():
		var col := get_slide_collision(i)
		var collider := col.get_collider()
		if collider is Car:
			var other := collider as Car
			var rel_v: Vector3 = velocity - other.velocity
			var closing: float = rel_v.dot(-col.get_normal())
			if closing > 2.8:
				if other.control_mode == ControlMode.TRAFFIC:
					other.control_mode = ControlMode.WRECKED
					other.wreck_timer = 18.0
				other.velocity += (-col.get_normal()) * closing * 0.82
				forward_speed *= 0.62
				velocity *= 0.62
				vehicle_crashed.emit(self, other, closing)
		elif collider and (collider as Node).is_in_group("pedestrians") and p_speed > 4.5:
			if collider.has_method("knockdown"):
				collider.call("knockdown", velocity * 0.75)
			pedestrian_struck.emit(self, collider as Node3D)


func _is_probe_blocked(test_yaw: float, dist: float) -> bool:
	var space := get_world_3d().direct_space_state
	var origin: Vector3 = global_position + Vector3(0.0, 0.8, 0.0)
	var target: Vector3 = origin + Vector3(sin(test_yaw), 0.0, cos(test_yaw)) * dist
	var query := PhysicsRayQueryParameters3D.create(origin, target)
	query.exclude = [self]
	var hit := space.intersect_ray(query)
	if hit.is_empty():
		return false
	var collider := hit.get("collider") as Node
	return collider != null and not collider.is_in_group("player") and not collider.is_in_group("pedestrians")


func enter_driver(p: Player) -> void:
	driver = p
	control_mode = ControlMode.PLAYER
	cockpit_view_active = false
	if chase_camera:
		chase_camera.current = true


func exit_driver() -> void:
	driver = null
	control_mode = ControlMode.PARKED
	cockpit_view_active = false
	if chase_camera:
		chase_camera.current = false
	if cockpit_camera:
		cockpit_camera.current = false


func toggle_camera_view() -> void:
	if vehicle_kind == VehicleKind.MOTORCYCLE:
		return
	cockpit_view_active = not cockpit_view_active
	if cockpit_camera and chase_camera:
		cockpit_camera.current = cockpit_view_active
		chase_camera.current = not cockpit_view_active


func notify_manual_camera_look() -> void:
	last_manual_look_time = elapsed_time


func _update_player_camera(delta: float) -> void:
	if not chase_pivot or not driver:
		return
	# Auto-follow behind car 2s after manual look
	if abs(forward_speed) > 1.8 and (elapsed_time - last_manual_look_time) > 2.0:
		var target_follow: float = yaw_angle + PI if forward_speed >= 0.0 else yaw_angle
		driver.cam_yaw = _damp_angle(driver.cam_yaw, target_follow, 2.6, delta)

	chase_pivot.global_rotation = Vector3(driver.cam_pitch, driver.cam_yaw, 0.0)

	var active_cam: Camera3D = cockpit_camera if (cockpit_view_active and cockpit_camera) else chase_camera
	if active_cam:
		var target_fov: float = 60.0 + clamp(abs(forward_speed) * 0.38, 0.0, 14.0)
		active_cam.fov = _damp(active_cam.fov, target_fov, 6.0, delta)


func _animate_wheels_and_steering(steer_in: float, delta: float) -> void:
	if fl_steer:
		fl_steer.rotation.y = steer_angle
	if fr_steer:
		fr_steer.rotation.y = steer_angle
	if steering_wheel:
		steering_wheel.rotation.z = _damp(steering_wheel.rotation.z, steer_in * deg_to_rad(75.0), 10.0, delta)

	wheel_spin += (forward_speed / 0.36) * delta
	for w in wheel_spin_nodes:
		if w is Node3D:
			(w as Node3D).rotation.x = wheel_spin


func _update_police_lightbar() -> void:
	if not is_police_unit or not lightbar_red or not lightbar_blue:
		return
	var mat_r := lightbar_red.get_active_material(0) as StandardMaterial3D
	var mat_b := lightbar_blue.get_active_material(0) as StandardMaterial3D
	if not mat_r or not mat_b:
		return
	if control_mode == ControlMode.POLICE_PURSUIT:
		var flash: bool = sin(elapsed_time * 18.0) > 0.0
		mat_r.emission_energy_multiplier = 3.2 if flash else 0.15
		mat_b.emission_energy_multiplier = 0.15 if flash else 3.2
	else:
		mat_r.emission_energy_multiplier = 0.2
		mat_b.emission_energy_multiplier = 0.2


func _set_taillight_intensity(energy: float) -> void:
	if taillight_mesh:
		var mat := taillight_mesh.get_active_material(0) as StandardMaterial3D
		if mat:
			mat.emission_energy_multiplier = energy


func set_door_open_amount(amount: float) -> void:
	if door_pivot:
		door_pivot.rotation.y = -amount * deg_to_rad(68.0)


func get_driver_door_world_pos() -> Vector3:
	var right: Vector3 = Vector3(cos(yaw_angle), 0.0, -sin(yaw_angle))
	return global_position - right * (vehicle_width * 0.5 + 0.65)


func find_safe_exit_position() -> Vector3:
	var right: Vector3 = Vector3(cos(yaw_angle), 0.0, -sin(yaw_angle))
	var side_dist: float = vehicle_width * 0.5 + 0.95
	var left_candidate: Vector3 = global_position - right * side_dist
	var right_candidate: Vector3 = global_position + right * side_dist
	# Prefer left driver-side exit unless blocked by wall/collider
	var space := get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(global_position + Vector3.UP, left_candidate + Vector3.UP)
	query.exclude = [self]
	return right_candidate if not space.intersect_ray(query).is_empty() else left_candidate


func eject_occupant() -> void:
	# Override or connect to spawn a fleeing NPC when hijacking moving traffic
	pass


func _damp(current: float, target: float, lambda: float, delta: float) -> float:
	return lerp(current, target, 1.0 - exp(-lambda * delta))


func _damp_angle(current: float, target: float, lambda: float, delta: float) -> float:
	return lerp_angle(current, target, 1.0 - exp(-lambda * delta))
