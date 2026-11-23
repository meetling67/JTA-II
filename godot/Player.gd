extends CharacterBody3D
class_name Player

## Attach this script to a CharacterBody3D node named "Player" in your main scene.
## Required child nodes (see setup guide):
## - CollisionShape3D (CapsuleShape3D: radius 0.42, height 1.8)
## - VisualRig (Node3D) with optional LeftArmPivot, RightArmPivot, LeftLegPivot, RightLegPivot
## - CameraPivot (Node3D) at y = 1.55 -> SpringArm3D (length 4.2) -> Camera3D

signal punched_pedestrian(pedestrian: Node3D)

@export_group("Movement")
@export var walk_speed: float = 3.2
@export var sprint_speed: float = 6.4
@export var jump_velocity: float = 6.2
@export var gravity: float = 16.5
@export var interact_radius: float = 4.4

@export_group("Camera")
@export var mouse_sensitivity: float = 0.0024
@export var invert_y: bool = true
@export var min_pitch_deg: float = -65.0
@export var max_pitch_deg: float = 8.0

@onready var visual_rig: Node3D = get_node_or_null("VisualRig")
@onready var left_arm: Node3D = get_node_or_null("VisualRig/LeftArmPivot")
@onready var right_arm: Node3D = get_node_or_null("VisualRig/RightArmPivot")
@onready var left_leg: Node3D = get_node_or_null("VisualRig/LeftLegPivot")
@onready var right_leg: Node3D = get_node_or_null("VisualRig/RightLegPivot")
@onready var camera_pivot: Node3D = get_node_or_null("CameraPivot")
@onready var spring_arm: SpringArm3D = get_node_or_null("CameraPivot/SpringArm3D")
@onready var camera: Camera3D = get_node_or_null("CameraPivot/SpringArm3D/Camera3D")

var cam_yaw: float = PI
var cam_pitch: float = -0.22
var walk_phase: float = 0.0
var punch_timer: float = 0.0
var punch_hit_done: bool = false

var driven_vehicle: Car = null
var pending_vehicle: Car = null
var entry_timer: float = 0.0
var entry_start_pos: Vector3 = Vector3.ZERO
var auto_mount_blocked_until: float = 0.0
var elapsed_time: float = 0.0


func _ready() -> void:
	add_to_group("player")
	Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
	if camera:
		camera.current = true


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED:
		var y_sign: float = 1.0 if invert_y else -1.0
		cam_yaw -= event.relative.x * mouse_sensitivity
		cam_pitch = clamp(
			cam_pitch + event.relative.y * mouse_sensitivity * y_sign,
			deg_to_rad(min_pitch_deg),
			deg_to_rad(max_pitch_deg)
		)
		if driven_vehicle:
			driven_vehicle.notify_manual_camera_look()

	elif event is InputEventMouseButton and event.pressed:
		if Input.get_mouse_mode() != Input.MOUSE_MODE_CAPTURED:
			Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)


func _physics_process(delta: float) -> void:
	elapsed_time += delta

	if Input.is_action_just_pressed("interact_vehicle"):
		interact_vehicle()

	if pending_vehicle:
		_step_vehicle_entry(delta)
		return

	if driven_vehicle:
		# Follow vehicle position while seated inside
		global_position = driven_vehicle.global_position
		velocity = driven_vehicle.velocity
		return

	if Input.is_action_just_pressed("punch"):
		trigger_punch()

	_step_on_foot_movement(delta)
	_step_punch_animation(delta)
	_update_camera_rig()


func _step_on_foot_movement(delta: float) -> void:
	var input_dir: Vector2 = Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var sprinting: bool = Input.is_action_pressed("sprint")
	var max_spd: float = sprint_speed if sprinting else walk_speed

	# Camera-relative horizontal movement vectors
	var fwd: Vector3 = Vector3(-sin(cam_yaw), 0.0, -cos(cam_yaw))
	var right: Vector3 = Vector3(cos(cam_yaw), 0.0, -sin(cam_yaw))
	var wish_dir: Vector3 = (fwd * -input_dir.y + right * input_dir.x)

	if wish_dir.length_squared() > 0.001:
		wish_dir = wish_dir.normalized()
		velocity.x = _damp(velocity.x, wish_dir.x * max_spd, 12.0, delta)
		velocity.z = _damp(velocity.z, wish_dir.z * max_spd, 12.0, delta)
		var target_yaw: float = atan2(wish_dir.x, wish_dir.z)
		if visual_rig:
			visual_rig.rotation.y = _damp_angle(visual_rig.rotation.y, target_yaw, 11.0, delta)
	else:
		velocity.x = _damp(velocity.x, 0.0, 14.0, delta)
		velocity.z = _damp(velocity.z, 0.0, 14.0, delta)

	if is_on_floor():
		if Input.is_action_just_pressed("jump"):
			velocity.y = jump_velocity
	else:
		velocity.y -= gravity * delta

	move_and_slide()

	# Check auto-mount motorcycle when walking closely onto a parked bike
	var horiz_speed: float = Vector2(velocity.x, velocity.z).length()
	if elapsed_time > auto_mount_blocked_until and horiz_speed > 0.6:
		for node in get_tree().get_nodes_in_group("vehicles"):
			var car := node as Car
			if car and car.vehicle_kind == Car.VehicleKind.MOTORCYCLE and car.control_mode == Car.ControlMode.PARKED:
				if global_position.distance_squared_to(car.global_position) < 1.35 * 1.35:
					begin_vehicle_entry(car)
					break

	# Animate walk / sprint / idle limbs
	if horiz_speed > 0.25 and is_on_floor():
		walk_phase += delta * horiz_speed * 2.7
		var amp: float = min(0.75, horiz_speed * 0.13)
		if left_leg:
			left_leg.rotation.x = sin(walk_phase) * amp
		if right_leg:
			right_leg.rotation.x = -sin(walk_phase) * amp
		if left_arm:
			left_arm.rotation.x = -sin(walk_phase) * amp * 0.85
		if right_arm and punch_timer <= 0.0:
			right_arm.rotation.x = sin(walk_phase) * amp * 0.85
	else:
		if left_leg:
			left_leg.rotation.x = _damp(left_leg.rotation.x, 0.0, 12.0, delta)
		if right_leg:
			right_leg.rotation.x = _damp(right_leg.rotation.x, 0.0, 12.0, delta)
		if left_arm:
			left_arm.rotation.x = _damp(left_arm.rotation.x, 0.0, 12.0, delta)
		if right_arm and punch_timer <= 0.0:
			right_arm.rotation.x = _damp(right_arm.rotation.x, 0.0, 12.0, delta)


func trigger_punch() -> void:
	if driven_vehicle or pending_vehicle or punch_timer > 0.0:
		return
	punch_timer = 0.42
	punch_hit_done = false


func _step_punch_animation(delta: float) -> void:
	if punch_timer <= 0.0:
		if visual_rig:
			visual_rig.rotation.x = 0.0
		return

	punch_timer = max(0.0, punch_timer - delta)
	var progress: float = 1.0 - (punch_timer / 0.42)
	var swing: float = sin(progress * PI)

	if right_arm:
		right_arm.rotation = Vector3(-swing * 1.65, 0.0, 0.15)

	if not punch_hit_done and progress > 0.32:
		punch_hit_done = true
		var yaw: float = visual_rig.rotation.y if visual_rig else rotation.y
		var fwd: Vector3 = Vector3(sin(yaw), 0.0, cos(yaw))
		for node in get_tree().get_nodes_in_group("pedestrians"):
			var ped := node as Node3D
			if not ped:
				continue
			var to_ped: Vector3 = ped.global_position - global_position
			to_ped.y = 0.0
			var dist: float = to_ped.length()
			if dist < 2.2 and dist > 0.01:
				if to_ped.normalized().dot(fwd) > 0.1:
					if ped.has_method("knockdown"):
						ped.call("knockdown", fwd * 6.5)
					punched_pedestrian.emit(ped)


func interact_vehicle() -> void:
	if pending_vehicle:
		return
	if driven_vehicle:
		exit_vehicle()
		return

	var best: Car = find_nearest_vehicle(interact_radius)
	if best:
		begin_vehicle_entry(best)


func find_nearest_vehicle(max_dist: float) -> Car:
	var best: Car = null
	var best_d2: float = max_dist * max_dist
	for node in get_tree().get_nodes_in_group("vehicles"):
		var car := node as Car
		if not car:
			continue
		var d2: float = Vector2(
			car.global_position.x - global_position.x,
			car.global_position.z - global_position.z
		).length_squared()
		if d2 < best_d2:
			best_d2 = d2
			best = car
	return best


func begin_vehicle_entry(car: Car) -> void:
	pending_vehicle = car
	entry_timer = 0.0
	entry_start_pos = global_position
	car.eject_occupant()

	if car.vehicle_kind == Car.VehicleKind.MOTORCYCLE:
		_finish_vehicle_entry()


func _step_vehicle_entry(delta: float) -> void:
	entry_timer += delta
	var car := pending_vehicle
	var open_amt: float = smoothstep(0.1, 0.55, entry_timer)
	car.set_door_open_amount(open_amt)

	var door_world: Vector3 = car.get_driver_door_world_pos()
	global_position = entry_start_pos.lerp(door_world, min(1.0, entry_timer * 2.4))
	if visual_rig:
		var look_dir: Vector3 = car.global_position - global_position
		visual_rig.rotation.y = atan2(look_dir.x, look_dir.z)

	if entry_timer >= 0.72:
		_finish_vehicle_entry()


func _finish_vehicle_entry() -> void:
	var car := pending_vehicle
	pending_vehicle = null
	if not car:
		return

	car.set_door_open_amount(0.0)
	car.enter_driver(self)
	driven_vehicle = car

	# Hide on-foot collision while seated in vehicle
	var col := get_node_or_null("CollisionShape3D") as CollisionShape3D
	if col:
		col.disabled = true
	if visual_rig:
		visual_rig.visible = false
	if camera:
		camera.current = false


func exit_vehicle() -> void:
	if not driven_vehicle:
		return
	var car := driven_vehicle
	var exit_pos: Vector3 = car.find_safe_exit_position()

	car.exit_driver()
	driven_vehicle = null

	global_position = exit_pos
	velocity = Vector3.ZERO
	var col := get_node_or_null("CollisionShape3D") as CollisionShape3D
	if col:
		col.disabled = false
	if visual_rig:
		visual_rig.visible = true
		visual_rig.rotation.y = car.rotation.y
	if camera:
		camera.current = true

	if car.vehicle_kind == Car.VehicleKind.MOTORCYCLE:
		auto_mount_blocked_until = elapsed_time + 3.0


func _update_camera_rig() -> void:
	if not camera_pivot:
		return
	camera_pivot.rotation.y = cam_yaw
	camera_pivot.rotation.x = cam_pitch


func _damp(current: float, target: float, lambda: float, delta: float) -> float:
	return lerp(current, target, 1.0 - exp(-lambda * delta))


func _damp_angle(current: float, target: float, lambda: float, delta: float) -> float:
	return lerp_angle(current, target, 1.0 - exp(-lambda * delta))
