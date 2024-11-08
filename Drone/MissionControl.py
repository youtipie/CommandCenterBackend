from typing import Iterable

from dronekit import Vehicle, LocationGlobalRelative, Command, CommandSequence, VehicleMode
from pymavlink import mavutil

from .utils import get_distance_metres, check_is_drone_command_allowed


class MissionControl:
    def __init__(self, vehicle: Vehicle):
        self.vehicle = vehicle
        self.download_mission()

    def download_mission(self):
        cmds = self.vehicle.commands
        cmds.download()
        cmds.wait_ready()

    def clear_mission(self) -> None:
        self.vehicle.commands.clear()
        self.upload_commands()

    def add_command(self, command: Command) -> None:
        if not check_is_drone_command_allowed(command):
            raise ValueError("Command not allowed.")
        self.vehicle.commands.add(command)

    def upload_commands(self) -> None:
        self.vehicle.commands.upload()

    def start_mission(self, commands: Iterable[Command]) -> str:
        self.clear_mission()
        for command in commands:
            self.add_command(command)

        # Adding dummy command, so we can track when mission is finished
        self.add_command(Command(0, 0, 0, mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT,
                                 mavutil.mavlink.MAV_CMD_NAV_RETURN_TO_LAUNCH, 0, 0,
                                 0, 0, 0,
                                 0, 0, 0, 0))
        self.upload_commands()
        self.vehicle.mode = VehicleMode("AUTO")
        return "Started mission"

    def get_current_mission(self) -> CommandSequence:
        return self.vehicle.commands

    def get_mission_progress(self) -> float:
        num_waypoints = len(self.vehicle.commands)
        if num_waypoints == 0:
            return 1
        current_waypoint = self.vehicle.commands.next
        if not self.vehicle.armed and self.vehicle.mode.name == "AUTO" and current_waypoint == 1:
            return 1
        return current_waypoint / num_waypoints

    def is_mission_finished(self) -> bool:
        return self.get_mission_progress() == 1

    def get_distance_to_next_waypoint(self) -> None:
        next_waypoint = self.vehicle.commands.next
        if next_waypoint == 0:
            return None
        mission_item = self.vehicle.commands[next_waypoint - 1]
        lat = mission_item.x
        lon = mission_item.y
        alt = mission_item.z
        if mission_item.command == mavutil.mavlink.MAV_CMD_NAV_RETURN_TO_LAUNCH:
            lat = self.vehicle.home_location.lat
            lon = self.vehicle.home_location.lon
            alt = 0

        # TODO: SOME COMMANDS MAY HAVE 0, 0, 0 AS XYZ. HANDLE IT
        # Temporary fix
        if (lat, lon, alt) == (0, 0, 0):
            return 0

        targetWaypointLocation = LocationGlobalRelative(lat, lon, alt)
        distance_to_point = get_distance_metres(self.vehicle.location.global_relative_frame, targetWaypointLocation)
        return distance_to_point

    def get_mission_status(self):
        return {
            "have_mission": len(self.vehicle.commands) > 0,
            "mission_progress": self.get_mission_progress(),
            "is_mission_finished": self.is_mission_finished(),
            "distance_to_next_waypoint": self.get_distance_to_next_waypoint(),
            "current_waypoint": self.vehicle.commands.next,
            "waypoints": [{
                **dict((name, getattr(command, name)) for name in command.fieldnames)
            } for command in self.vehicle.commands]
        }
