import {useEffect, useRef, useState} from "react";
import {StyleSheet, View} from "react-native";
import MapboxGL from "@rnmapbox/maps";
import {horizontalScale, verticalScale} from "../../utils/metrics";
import OverlayButtons from "../OverlayButtons";
import WaypointsLog from "../WaypointsLog";
import * as ScreenOrientation from "expo-screen-orientation";
import * as NavigationBar from "expo-navigation-bar";
import {useNavigation} from "@react-navigation/native";
import DroneMarker from "./components/DroneMarker";
import MarkerLines from "./components/MarkerLines";
import Markers from "./components/Markers";
import {notDisplayedCommands} from "../../constants/commands";

const styleURLs = [MapboxGL.StyleURL.Satellite, MapboxGL.StyleURL.SatelliteStreet, MapboxGL.StyleURL.Outdoors, MapboxGL.StyleURL.Street];


const Map = ({
                 children,
                 waypoints,
                 onWaypointsChange = null,
                 droneId = null,
                 droneData = null,
                 isEditable = false,
                 onDragEnd = null
             }) => {
    const cameraRef = useRef();
    const mapRef = useRef();
    const navigation = useNavigation();

    const [time, setTime] = useState(null);
    const [startPosition, setStartPosition] = useState(null);

    const [headerShown, setHeaderShown] = useState(true);
    const [styleURL, setStyleURL] = useState(styleURLs[styleURLs.length - 1]);
    const [selectedWaypoint, setSelectedWaypoint] = useState();

    const waypointsWithCoordinates = waypoints.filter(waypoint => (
        !notDisplayedCommands.includes(waypoint.command)
    ));

    const centerCamera = useRef(droneData ? [droneData.lon, droneData.lat] : waypointsWithCoordinates[0] ? [waypointsWithCoordinates[0].y, waypointsWithCoordinates[0].x] : undefined);

    const handlePress = () => {
        if (selectedWaypoint !== null && selectedWaypoint !== undefined) {
            setSelectedWaypoint(undefined);
            return;
        }
        navigation.setOptions({headerShown: headerShown});
        setHeaderShown(!headerShown);
    }

    // Workaround for onLongPress
    const handleTouchStart = ({timeStamp, nativeEvent}) => {
        if (nativeEvent.touches.length === 1) {
            setTime(timeStamp);
            setStartPosition({
                x: nativeEvent.touches[0].pageX,
                y: nativeEvent.touches[0].pageY,
            });
        }
    }
    // Workaround for onLongPress
    const handleTouchMove = ({nativeEvent}) => {
        if (startPosition) {
            const {pageX, pageY} = nativeEvent.touches[0];
            const dx = Math.abs(pageX - startPosition.x);
            const dy = Math.abs(pageY - startPosition.y);

            if (dx > 3 || dy > 3) {
                setTime(null);
                setStartPosition(null);
            }
        }
    }
    // Workaround for onLongPress
    const handleTouchEnd = async ({timeStamp, nativeEvent}) => {
        if (time && nativeEvent.touches.length === 0) {
            const duration = timeStamp - time;

            if (duration > 1000 && startPosition) {
                handleLongPress(await mapRef.current?.getCoordinateFromView([nativeEvent.pageX, nativeEvent.pageY]));
            }
        }
        setTime(null);
        setStartPosition(null);
    }

    const handleLongPress = (coordinates) => {
        if (isEditable) {
            const [lon, lat] = coordinates;
            const waypoint = {
                command: 16,
                param1: 0,
                param2: 0,
                param3: 0,
                param4: 0,
                x: lat,
                y: lon,
                z: 50
            };
            onWaypointsChange?.(prev => [...prev, waypoint]);
        }
    }

    const handleSelectWaypoint = (index) => {
        const marker = waypointsWithCoordinates[index];
        setSelectedWaypoint(waypoints.indexOf(marker));
    }

    const handleMarkerDragEnd = (payload, index) => {
        const {coordinates} = payload.geometry;
        const marker = waypointsWithCoordinates[index];
        onDragEnd?.(coordinates.reverse(), waypoints.indexOf(marker));
    }

    useEffect(() => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        NavigationBar.setBehaviorAsync('overlay-swipe')
        NavigationBar.setVisibilityAsync("hidden");
        navigation.setOptions({headerShown: false});

        return () => {
            ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
            NavigationBar.setVisibilityAsync("visible");
        }
    }, []);

    useEffect(() => {
        if (cameraRef.current) {
            console.log(cameraRef.current);
        }
    }, [cameraRef]);

    return (
        <View style={styles.root}>
            <View style={styles.map}>
                <MapboxGL.MapView
                    ref={mapRef}
                    styleURL={styleURL}
                    style={styles.map}
                    logoEnabled={false}
                    attributionEnabled={false}
                    compassEnabled={true}
                    rotateEnabled={false}
                    compassPosition={{left: horizontalScale(5), top: verticalScale(30)}}
                    onPress={handlePress}
                    onLongPress={({geometry}) => handleLongPress(geometry.coordinates)}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    <MapboxGL.Camera
                        ref={cameraRef}
                        // zoomLevel={15} causes symbol layer to disappear
                        centerCoordinate={centerCamera.current}
                        animationDuration={0}
                    />
                    {droneData &&
                        <DroneMarker droneData={droneData} waypointsWithCoordinates={waypointsWithCoordinates}/>
                    }
                    <MarkerLines waypointsWithCoordinates={waypointsWithCoordinates}/>
                    <Markers
                        isEditable={isEditable}
                        waypoints={waypoints}
                        waypointsWithCoordinates={waypointsWithCoordinates}
                        selectedWaypoint={selectedWaypoint}
                        handleSelectWaypoint={handleSelectWaypoint}
                        handleMarkerDragEnd={handleMarkerDragEnd}
                    />
                </MapboxGL.MapView>
                <View style={styles.overlayContainer}>
                    <OverlayButtons
                        droneId={droneId ?? null}
                        cameraRef={cameraRef}
                        onStyleURLChange={setStyleURL}
                        styleURLs={styleURLs}
                        centerLocation={centerCamera.current}
                    />
                </View>
            </View>
            {children}
            <View style={styles.overlayContainer}>
                <WaypointsLog
                    waypoints={waypoints}
                    isEditing={isEditable}
                    selectedIndex={selectedWaypoint}
                    onSelectedIndex={setSelectedWaypoint}
                    onWaypointsChange={onWaypointsChange}
                />
            </View>
        </View>
    );
};

export default Map;

const styles = StyleSheet.create({
    root: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center"
    },
    map: {
        flex: 1,
        height: "100%",
    },
    overlayContainer: {
        position: "absolute",
        flexDirection: "row",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
    }
});