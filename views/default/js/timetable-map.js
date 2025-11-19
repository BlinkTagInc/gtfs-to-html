/* global maplibregl, Pbf, FeedMessage, mapStyleUrl, stopData, routeData, routeIds, tripIds, geojsons, gtfsRealtimeUrls */
/* eslint prefer-arrow-callback: "off", no-unused-vars: "off" */

const maps = {};
const vehicleMarkers = {};
const vehicleMarkersEventListeners = {};
let vehiclePositions;
let tripUpdates;
let vehiclePopup;
let gtfsRealtimeInterval;

function formatRouteColor(route) {
  return route.route_color || '#000000';
}

function formatRouteTextColor(route) {
  return route.route_text_color || '#FFFFFF';
}

function degToCompass(num) {
  const val = Math.floor(num / 22.5 + 0.5);
  const arr = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  return arr[val % 16];
}

function metersPerSecondToMph(metersPerSecond) {
  return metersPerSecond * 2.23694;
}

function formatSpeed(mph) {
  return `${Math.round(mph * 10) / 10} mph`;
}

function formatSeconds(seconds) {
  return seconds < 60
    ? Math.floor(seconds) + ' sec'
    : Math.floor(seconds / 60) + ' min';
}

function formatRoute(route) {
  const html = route.route_url
    ? document.createElement('a')
    : document.createElement('div');

  if (route.route_url) {
    html.href = route.route_url;
  }

  html.className = 'map-route-item';

  // Only add color swatch if route has a color
  if (route.route_color) {
    const swatch = document.createElement('div');
    swatch.className = 'route-color-swatch';
    swatch.style.backgroundColor = formatRouteColor(route);
    swatch.style.color = formatRouteTextColor(route);
    swatch.textContent = route.route_short_name ?? '';
    html.appendChild(swatch);
  }

  const textDiv = document.createElement('div');
  textDiv.className = 'underline-hover';
  textDiv.textContent =
    route.route_long_name ?? `Route ${route.route_short_name}`;
  html.appendChild(textDiv);

  return html.outerHTML;
}

function getStopPopupHtml(feature, stop) {
  const routeIds = JSON.parse(feature.properties.route_ids);
  const html = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'popup-title';
  title.textContent = stop.stop_name;
  html.appendChild(title);

  if (stop.stop_code ?? false) {
    const stopCodeContainer = document.createElement('div');

    const label = document.createElement('div');
    label.className = 'popup-label';
    label.textContent = 'Stop Code:';
    stopCodeContainer.appendChild(label);

    const code = document.createElement('strong');
    code.textContent = stop.stop_code;
    stopCodeContainer.appendChild(code);

    html.appendChild(stopCodeContainer);
  }

  if (tripUpdates) {
    const stopTimeUpdates = {
      0: [],
      1: [],
    };

    for (const tripUpdate of tripUpdates) {
      const stopTimeUpdatesForStop =
        tripUpdate.trip_update.stop_time_update.filter(
          (stopTimeUpdate) =>
            stopTimeUpdate.stop_id === stop.stop_id &&
            (stopTimeUpdate.departure !== null ||
              stopTimeUpdate.arrival !== null) &&
            stopTimeUpdate.schedule_relationship !== 3,
        );
      if (stopTimeUpdatesForStop.length > 0) {
        stopTimeUpdates[tripUpdate.trip_update.trip.direction_id].push(
          ...stopTimeUpdatesForStop,
        );
      }
    }

    stopTimeUpdates['0'].sort((a, b) => {
      const timeA = a.departure ? a.departure.time : a.arrival.time;
      const timeB = b.departure ? b.departure.time : b.arrival.time;
      return timeA - timeB;
    });

    stopTimeUpdates['1'].sort((a, b) => {
      const timeA = a.departure ? a.departure.time : a.arrival.time;
      const timeB = b.departure ? b.departure.time : b.arrival.time;
      return timeA - timeB;
    });

    if (stopTimeUpdates['0'].length > 0 || stopTimeUpdates['1'].length > 0) {
      const departuresLabel = document.createElement('div');
      departuresLabel.className = 'popup-label';
      departuresLabel.textContent = 'Upcoming Departures:';
      html.appendChild(departuresLabel);

      for (const direction of ['0', '1']) {
        if (stopTimeUpdates[direction].length > 0) {
          const timetableElement = document.querySelector(
            `.timetable[data-direction-id="${direction}"]`,
          );
          const directionName = timetableElement
            ? timetableElement.dataset.directionName
            : '';
          const departureTimes = stopTimeUpdates[direction].map(
            (stopTimeUpdate) =>
              Math.round(
                ((stopTimeUpdate.departure
                  ? stopTimeUpdate.departure.time
                  : stopTimeUpdate.arrival.time) -
                  Date.now() / 1000) /
                  60,
              ),
          );

          // Only use the next 4 departures
          const formattedDepartures = new Intl.ListFormat('en', {
            style: 'long',
            type: 'conjunction',
          }).format(departureTimes.slice(0, 4).map((time) => `<b>${time}</b>`));

          const departureDiv = document.createElement('div');
          departureDiv.innerHTML = `<b>${directionName}</b> in ${formattedDepartures} min`;
          html.appendChild(departureDiv);
        }
      }
    }
  }

  const routesLabel = document.createElement('div');
  routesLabel.className = 'popup-label';
  routesLabel.textContent = 'Routes Served:';
  html.appendChild(routesLabel);

  const routeList = document.createElement('div');
  routeList.className = 'route-list';
  routeList.innerHTML = routeIds
    .map((routeId) => formatRoute(routeData[routeId]))
    .join('');
  html.appendChild(routeList);

  const streetviewLink = document.createElement('a');
  streetviewLink.className = 'btn-active btn-sm';
  streetviewLink.href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${feature.geometry.coordinates[1]},${feature.geometry.coordinates[0]}&heading=0&pitch=0&fov=90`;
  streetviewLink.target = '_blank';
  streetviewLink.rel = 'noopener noreferrer';
  streetviewLink.textContent = 'View on Streetview';
  html.appendChild(streetviewLink);

  return html.outerHTML;
}

function getBounds(geojson) {
  const bounds = new maplibregl.LngLatBounds();
  for (const feature of geojson.features) {
    if (feature.geometry.type.toLowerCase() === 'point') {
      bounds.extend(feature.geometry.coordinates);
    } else if (feature.geometry.type.toLowerCase() === 'linestring') {
      for (const coordinate of feature.geometry.coordinates) {
        bounds.extend(coordinate);
      }
    } else if (feature.geometry.type.toLowerCase() === 'multilinestring') {
      for (const linestring of feature.geometry.coordinates) {
        for (const coordinate of linestring) {
          bounds.extend(coordinate);
        }
      }
    }
  }

  return bounds;
}

function secondsInFuture(dateString) {
  // Takes a dateString in the format of "YYYYMMDD HH:mm:ss" and returns number of seconds in the future or 0 if the date is in the past

  const inputDate = new Date(
    dateString.substring(0, 4), // Year
    dateString.substring(4, 6) - 1, // Month (zero-indexed)
    dateString.substring(6, 8), // Day
    dateString.substring(9, 11), // Hours
    dateString.substring(12, 14), // Minutes
    dateString.substring(15, 17), // Seconds
  );

  const now = new Date();
  const diffInMilliseconds = inputDate - now;
  const diffInSeconds = Math.floor(diffInMilliseconds / 1000);

  // If the date is in the future, return the number of seconds, otherwise return 0
  return diffInSeconds > 0 ? diffInSeconds : 0;
}

function formatMovingText(vehiclePosition) {
  let movingText = '';

  if (
    (vehiclePosition.vehicle.position.bearing !== undefined &&
      vehiclePosition.vehicle.position.bearing !== 0) ||
    vehiclePosition.vehicle.position.speed
  ) {
    movingText += 'Moving ';
  }

  if (
    vehiclePosition.vehicle.position.bearing !== undefined &&
    vehiclePosition.vehicle.position.bearing !== 0
  ) {
    movingText += degToCompass(vehiclePosition.vehicle.position.bearing);
  }
  if (vehiclePosition.vehicle.position.speed) {
    movingText += ` at ${formatSpeed(metersPerSecondToMph(vehiclePosition.vehicle.position.speed))}`;
  }

  return movingText;
}

function getVehiclePopupHtml(vehiclePosition, vehicleTripUpdate) {
  const html = document.createElement('div');
  html.dataset.vehicleId = vehiclePosition.vehicle.vehicle.id;

  const lastUpdated = new Date(vehiclePosition.vehicle.timestamp * 1000);
  const tripElement = document.querySelector(
    `.timetable [data-trip-id="${vehiclePosition.vehicle.trip.trip_id}"]`,
  );
  const timetableElement = tripElement
    ? tripElement.closest('.timetable')
    : null;
  const directionName = timetableElement
    ? timetableElement.dataset.directionName
    : null;

  if (directionName) {
    const title = document.createElement('div');
    title.className = 'popup-title';
    title.textContent = `Vehicle: ${directionName}`;
    html.appendChild(title);
  }

  const movingText = formatMovingText(vehiclePosition);

  if (movingText) {
    const movingDiv = document.createElement('div');
    movingDiv.textContent = movingText;
    html.appendChild(movingDiv);
  }

  const numberOfArrivalsToShow = 5;
  const nextArrivals = [];
  if (vehicleTripUpdate && vehicleTripUpdate.trip_update.stop_time_update) {
    for (const stoptimeUpdate of vehicleTripUpdate.trip_update
      .stop_time_update) {
      if (stoptimeUpdate.arrival) {
        const secondsToArrival =
          stoptimeUpdate.arrival.time - Date.now() / 1000;
        const stopName = stopData[stoptimeUpdate.stop_id]?.stop_name;

        // Don't show arrivals in the past or non-timepoints
        if (secondsToArrival > 0 && stopName) {
          nextArrivals.push({
            delay: stoptimeUpdate.arrival.delay,
            secondsToArrival,
            stopName,
          });
        }

        if (nextArrivals.length >= numberOfArrivalsToShow) {
          break;
        }
      }
    }
  }

  if (nextArrivals.length > 0) {
    const upcomingStops = document.createElement('div');
    upcomingStops.className = 'upcoming-stops';

    const timeHeader = document.createElement('div');
    timeHeader.textContent = 'Time';
    upcomingStops.appendChild(timeHeader);

    const stopHeader = document.createElement('div');
    stopHeader.textContent = 'Upcoming Stop';
    upcomingStops.appendChild(stopHeader);

    for (const arrival of nextArrivals) {
      let delay = '';

      if (arrival.delay > 0) {
        delay = `(${formatSeconds(arrival.delay)} behind schedule)`;
      } else if (arrival.delay < 0) {
        delay = `(${formatSeconds(arrival.delay)} ahead of schedule)`;
      }

      const timeDiv = document.createElement('div');
      timeDiv.textContent = formatSeconds(arrival.secondsToArrival);
      upcomingStops.appendChild(timeDiv);

      const stopDiv = document.createElement('div');
      stopDiv.textContent = `${arrival.stopName} ${delay}`;
      upcomingStops.appendChild(stopDiv);
    }

    html.appendChild(upcomingStops);
  }

  const updatedDiv = document.createElement('div');
  updatedDiv.className = 'vehicle-updated';
  updatedDiv.textContent = `Updated: ${lastUpdated.toLocaleTimeString()}`;
  html.appendChild(updatedDiv);

  return html.outerHTML;
}

function getVehicleBearing(vehiclePosition, vehicleTripUpdate) {
  // If vehicle position includes bearing, use that
  if (
    vehiclePosition.vehicle.position.bearing !== undefined &&
    vehiclePosition.vehicle.position.bearing !== 0
  ) {
    return vehiclePosition.vehicle.position.bearing;
  }

  // Else try to calculate bearing from next stop
  if (vehicleTripUpdate?.trip_update?.stop_time_update?.length > 0) {
    const nextStopTimeUpdate =
      vehicleTripUpdate.trip_update.stop_time_update[0];
    const nextStop = stopData[nextStopTimeUpdate.stop_id];

    if (nextStop && nextStop.stop_lat && nextStop.stop_lon) {
      const vehicleLocation = vehiclePosition.vehicle.position;
      const lat1 = vehicleLocation.latitude;
      const lon1 = vehicleLocation.longitude;
      const lat2 = nextStop.stop_lat;
      const lon2 = nextStop.stop_lon;

      const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
      const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
      let bearing = (Math.atan2(y, x) * 180) / Math.PI;
      bearing = (bearing + 360) % 360;

      return bearing;
    }
  }

  return null;
}

function getVehicleDirectionArrow(vehiclePosition, vehicleTripUpdate) {
  const bearing = getVehicleBearing(vehiclePosition, vehicleTripUpdate);

  if (bearing !== null) {
    return `<div class="vehicle-marker-arrow" aria-hidden="true" style="transform:rotate(${bearing}deg)"></div>`;
  } else {
    return `<div class="vehicle-marker-arrow no-bearing" aria-hidden="true"></div>`;
  }
}

function attachVehicleMarkerClickHandler(
  vehiclePosition,
  vehicleTripUpdate,
  map,
) {
  const coordinates = [
    vehiclePosition.vehicle.position.longitude,
    vehiclePosition.vehicle.position.latitude,
  ];

  const vehicleMarker = vehicleMarkers[vehiclePosition.vehicle.vehicle.id];

  vehicleMarker
    .getElement()
    .removeEventListener(
      'click',
      vehicleMarkersEventListeners[vehiclePosition.vehicle.vehicle.id],
    );

  vehicleMarkersEventListeners[vehiclePosition.vehicle.vehicle.id] = (
    event,
  ) => {
    event.stopPropagation();
    if (vehiclePopup.isOpen()) {
      vehiclePopup.remove();
    }

    vehiclePopup
      .setLngLat(coordinates)
      .setHTML(getVehiclePopupHtml(vehiclePosition, vehicleTripUpdate))
      .addTo(map);
  };

  vehicleMarker
    .getElement()
    .addEventListener(
      'click',
      vehicleMarkersEventListeners[vehiclePosition.vehicle.vehicle.id],
    );
}

function addVehicleMarker(vehiclePosition, vehicleTripUpdate) {
  if (!vehiclePosition.vehicle || !vehiclePosition.vehicle.position) {
    return;
  }

  const visibleTimetable = document.querySelector(
    '.timetable:not([style*="display: none"])',
  );
  const visibleTimetableId = visibleTimetable
    ? visibleTimetable.dataset.timetableId
    : null;

  if (!visibleTimetableId) {
    return;
  }

  const vehicleDirectionArrow = getVehicleDirectionArrow(
    vehiclePosition,
    vehicleTripUpdate,
  );

  // Create a DOM element for each marker
  const el = document.createElement('div');
  el.className = 'vehicle-marker';
  el.style.width = '20px';
  el.style.height = '20px';

  if (vehicleDirectionArrow) {
    el.innerHTML = vehicleDirectionArrow;
  }

  const coordinates = [
    vehiclePosition.vehicle.position.longitude,
    vehiclePosition.vehicle.position.latitude,
  ];

  // Add marker to map
  const vehicleMarker = new maplibregl.Marker({
    element: el,
    anchor: 'center',
  })
    .setLngLat(coordinates)
    .addTo(maps[visibleTimetableId]);

  vehicleMarkers[vehiclePosition.vehicle.vehicle.id] = vehicleMarker;
}

function animateVehicleMarker(vehicleMarker, vehiclePosition) {
  const newCoordinates = [
    vehiclePosition.vehicle.position.longitude,
    vehiclePosition.vehicle.position.latitude,
  ];

  let startTime;
  const duration = 5000;
  const previousCoordinates = vehicleMarker.getLngLat().toArray();
  const longitudeDifference = newCoordinates[0] - previousCoordinates[0];
  const latitudeDifference = newCoordinates[1] - previousCoordinates[1];

  const animation = (timestamp) => {
    startTime = startTime || timestamp;
    const elapsedTime = timestamp - startTime;
    const progress = elapsedTime / duration;
    const safeProgress = Math.min(progress.toFixed(2), 1);
    const newLongitude =
      previousCoordinates[0] + safeProgress * longitudeDifference;
    const newLatitude =
      previousCoordinates[1] + safeProgress * latitudeDifference;

    vehicleMarker.setLngLat([newLongitude, newLatitude]);

    // Check if vehiclePopup element exists and is for this vehicle
    const popupElement = vehiclePopup.getElement();
    const markerPopupIsOpenForThisVehicle =
      popupElement &&
      popupElement.querySelector(
        `[data-vehicle-id="${vehiclePosition.vehicle.vehicle.id}"]`,
      );

    // Check if the open vehicle popup is for this vehicle
    if (vehiclePopup.isOpen() && markerPopupIsOpenForThisVehicle) {
      // Animate the popup along with the vehicle marker
      vehiclePopup.setLngLat([newLongitude, newLatitude]);
    }

    if (safeProgress !== 1) {
      requestAnimationFrame(animation);
    }
  };

  requestAnimationFrame(animation);
}

function updateVehicleMarkerLocation(
  vehicleMarker,
  vehiclePosition,
  vehicleTripUpdate,
) {
  const vehicleDirectionArrow = getVehicleDirectionArrow(
    vehiclePosition,
    vehicleTripUpdate,
  );

  if (vehicleDirectionArrow) {
    vehicleMarker.getElement().innerHTML = vehicleDirectionArrow;
  } else {
    vehicleMarker.getElement().innerHTML = '';
  }

  animateVehicleMarker(vehicleMarker, vehiclePosition);
}

async function fetchGtfsRealtime(url, headers) {
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    headers: { ...(headers ?? {}) },
  });

  if (!response.ok) {
    throw new Error(response.status);
  }

  const bufferRes = await response.arrayBuffer();
  const pdf = new Pbf(new Uint8Array(bufferRes));
  const obj = FeedMessage.read(pdf);
  return obj.entity;
}

async function updateArrivals() {
  const realtimeVehiclePositions = gtfsRealtimeUrls?.realtimeVehiclePositions;
  const realtimeTripUpdates = gtfsRealtimeUrls?.realtimeTripUpdates;

  if (!realtimeVehiclePositions) {
    return;
  }

  try {
    const [latestVehiclePositions, latestTripUpdates] = await Promise.all([
      fetchGtfsRealtime(
        realtimeVehiclePositions?.url,
        realtimeVehiclePositions?.headers,
      ),
      fetchGtfsRealtime(realtimeTripUpdates?.url, realtimeTripUpdates?.headers),
    ]);

    if (!latestVehiclePositions?.length) {
      const legendItems = document.querySelectorAll('.vehicle-legend-item');
      legendItems.forEach((item) => (item.style.display = 'none'));
      return;
    }

    const legendItems = document.querySelectorAll('.vehicle-legend-item');
    legendItems.forEach((item) => (item.style.display = ''));

    vehiclePositions = latestVehiclePositions.filter((vehiclePosition) => {
      if (
        !vehiclePosition ||
        !vehiclePosition.vehicle ||
        !vehiclePosition.vehicle.trip ||
        !vehiclePosition.vehicle.trip.trip_id
      ) {
        return false;
      }

      // Hide vehicles which show up 15 minutes or more before their trip start times
      if (
        secondsInFuture(
          `${vehiclePosition.vehicle.trip.start_date} ${vehiclePosition.vehicle.trip.start_time}`,
        ) >
        15 * 60
      ) {
        return false;
      }

      // If vehiclePosition includes route_id, use that to filter
      if (vehiclePosition.vehicle.trip.route_id) {
        return routeIds.includes(vehiclePosition.vehicle.trip.route_id);
      }

      // Otherwise, fall back to using trip_id to filter
      return tripIds.includes(vehiclePosition.vehicle.trip.trip_id);
    });

    tripUpdates = latestTripUpdates?.filter((tripUpdate) => {
      if (
        !tripUpdate ||
        !tripUpdate.trip_update ||
        !tripUpdate.trip_update.trip
      ) {
        return false;
      }

      return tripIds.includes(tripUpdate.trip_update.trip.trip_id);
    });

    for (const vehiclePosition of vehiclePositions) {
      const vehicleId = vehiclePosition.vehicle.vehicle.id;

      let vehicleTripUpdate = tripUpdates?.find(
        (tripUpdate) =>
          tripUpdate.trip_update.trip.trip_id ===
          vehiclePosition.vehicle.trip.trip_id,
      );

      if (!vehicleTripUpdate) {
        vehicleTripUpdate = tripUpdates?.find(
          (tripUpdate) => tripUpdate.trip_update.vehicle.id === vehicleId,
        );
      }

      let vehicleMarker = vehicleMarkers[vehicleId];

      if (vehicleMarker === undefined) {
        // If not on map, add it
        addVehicleMarker(vehiclePosition, vehicleTripUpdate);
      } else {
        // Otherwise update location
        updateVehicleMarkerLocation(
          vehicleMarker,
          vehiclePosition,
          vehicleTripUpdate,
        );
      }

      const visibleTimetable = document.querySelector(
        '.timetable:not([style*="display: none"])',
      );
      const visibleTimetableId = visibleTimetable
        ? visibleTimetable.dataset.timetableId
        : null;

      if (visibleTimetableId) {
        attachVehicleMarkerClickHandler(
          vehiclePosition,
          vehicleTripUpdate,
          maps[visibleTimetableId],
        );
      }
    }

    // Remove vehicles not in the feed
    for (const vehicleId of Object.keys(vehicleMarkers)) {
      if (
        !vehiclePositions.find(
          (vehiclePosition) => vehiclePosition.vehicle.vehicle.id === vehicleId,
        )
      ) {
        vehicleMarkers[vehicleId].remove();
        delete vehicleMarkers[vehicleId];
      }
    }
  } catch (error) {
    console.error(error);
  }
}

function toggleMap(id) {
  if (maps[id]) {
    // Resize the map to fit the visible area
    maps[id].resize();

    // Update vehicle markers to use the current visible map
    for (const [vehicleId, vehicleMarker] of Object.entries(vehicleMarkers)) {
      const vehiclePosition = vehiclePositions?.find(
        (vehiclePosition) => vehiclePosition.vehicle.vehicle.id === vehicleId,
      );

      const vehicleTripUpdate = tripUpdates?.find(
        (tripUpdate) => tripUpdate.trip_update.vehicle.id === vehicleId,
      );

      attachVehicleMarkerClickHandler(
        vehiclePosition,
        vehicleTripUpdate,
        maps[id],
      );

      // Move marker to the current visible map
      vehicleMarker.addTo(maps[id]);
    }
  }
}

function createMap(id) {
  const defaultRouteColor = '#000000';
  const lineLayout = {
    'line-join': 'round',
    'line-cap': 'round',
  };

  const geojson = geojsons[id];

  if (!geojson || geojson.features.length === 0) {
    const mapElement = document.querySelector(
      `.map[data-timetable-id="${id}"]`,
    );
    if (mapElement) {
      mapElement.style.display = 'none';
    }
    return false;
  }

  const bounds = getBounds(geojson);
  const map = new maplibregl.Map({
    container: document.querySelector(`.map[data-timetable-id="${id}"]`),
    style: mapStyleUrl,
    center: bounds.getCenter(),
    zoom: 12,
    preserveDrawingBuffer: true,
  });

  map.initialize = () => fitMapToBounds(map, bounds);

  map.scrollZoom.disable();
  map.addControl(new maplibregl.NavigationControl());
  map.addControl(new maplibregl.FullscreenControl());

  map.on('load', () => {
    fitMapToBounds(map, bounds);
    disablePointsOfInterest(map);
    addMapLayers(map, geojson, defaultRouteColor, lineLayout);
    setupEventListeners(map, id);
  });

  return map;
}

function fitMapToBounds(map, bounds) {
  map.fitBounds(bounds, {
    padding: { top: 40, bottom: 40, left: 20, right: 40 },
    duration: 0,
  });
}

function disablePointsOfInterest(map) {
  const layers = map.getStyle().layers;
  const poiLayerIds = layers
    .filter((layer) => layer.id.startsWith('poi'))
    ?.map((layer) => layer.id);
  poiLayerIds.forEach((layerId) => {
    map.setLayoutProperty(layerId, 'visibility', 'none');
  });
}

function addMapLayers(map, geojson, defaultRouteColor, lineLayout) {
  const layers = map.getStyle().layers;
  const firstLabelLayerId = layers.find(
    (layer) => layer.type === 'symbol' && layer.id.includes('label'),
  )?.id;

  addRouteLineShadow(map, geojson, lineLayout, firstLabelLayerId);
  addRouteLineOutline(map, geojson, lineLayout, firstLabelLayerId);
  addRouteLine(map, geojson, defaultRouteColor, lineLayout, firstLabelLayerId);
  addStops(map, geojson);
  addHighlightedStops(map, geojson);
}

function addRouteLineShadow(map, geojson, lineLayout, firstSymbolId) {
  map.addLayer(
    {
      id: 'route-line-shadow',
      type: 'line',
      source: { type: 'geojson', data: geojson },
      paint: {
        'line-color': '#000000',
        'line-opacity': 0.3,
        'line-width': {
          base: 12,
          stops: [
            [14, 20],
            [18, 42],
          ],
        },
        'line-blur': {
          base: 12,
          stops: [
            [14, 20],
            [18, 42],
          ],
        },
      },
      layout: lineLayout,
      filter: ['!has', 'stop_id'],
    },
    firstSymbolId,
  );
}

function addRouteLineOutline(map, geojson, lineLayout, firstSymbolId) {
  map.addLayer(
    {
      id: 'route-line-outline',
      type: 'line',
      source: { type: 'geojson', data: geojson },
      paint: {
        'line-color': '#FFFFFF',
        'line-opacity': 1,
        'line-width': {
          base: 8,
          stops: [
            [14, 12],
            [18, 32],
          ],
        },
      },
      layout: lineLayout,
      filter: ['!has', 'stop_id'],
    },
    firstSymbolId,
  );
}

function addRouteLine(
  map,
  geojson,
  defaultRouteColor,
  lineLayout,
  firstSymbolId,
) {
  map.addLayer(
    {
      id: 'route-line',
      type: 'line',
      source: { type: 'geojson', data: geojson },
      paint: {
        'line-color': ['to-color', ['get', 'route_color'], defaultRouteColor],
        'line-opacity': 1,
        'line-width': {
          base: 4,
          stops: [
            [14, 6],
            [18, 16],
          ],
        },
      },
      layout: lineLayout,
      filter: ['!has', 'stop_id'],
    },
    firstSymbolId,
  );
}

function addStops(map, geojson) {
  map.addLayer({
    id: 'stops',
    type: 'circle',
    source: { type: 'geojson', data: geojson },
    paint: {
      'circle-color': '#ffffff',
      'circle-radius': {
        base: 1.75,
        stops: [
          [12, 4],
          [22, 100],
        ],
      },
      'circle-stroke-color': '#3f4a5c',
      'circle-stroke-width': 2,
    },
    filter: ['has', 'stop_id'],
  });
}

function addHighlightedStops(map, geojson) {
  map.addLayer({
    id: 'stops-highlighted',
    type: 'circle',
    source: { type: 'geojson', data: geojson },
    paint: {
      'circle-color': '#f8f8b9',
      'circle-radius': {
        base: 1.75,
        stops: [
          [12, 6],
          [22, 150],
        ],
      },
      'circle-stroke-width': 2,
      'circle-stroke-color': '#3f4a5c',
    },
    filter: ['==', 'stop_id', ''],
  });
}

function setupEventListeners(map, id) {
  map.on('mousemove', (event) => handleMouseMove(event, map, id));
  map.on('click', (event) => handleClick(event, map));
  setupTableHoverListeners(id, map);
}

function handleMouseMove(event, map, id) {
  const features = map.queryRenderedFeatures(event.point, {
    layers: ['stops'],
  });
  if (features.length > 0) {
    map.getCanvas().style.cursor = 'pointer';
    const stopIds = [features[0].properties.stop_id];
    if (features[0].properties.parent_station) {
      stopIds.push(features[0].properties.parent_station);
    }
    highlightStop(map, id, stopIds);
  } else {
    map.getCanvas().style.cursor = '';
    unHighlightStop(map, id);
  }
}

function handleClick(event, map) {
  const bbox = [
    [event.point.x - 5, event.point.y - 5],
    [event.point.x + 5, event.point.y + 5],
  ];
  const features = map.queryRenderedFeatures(bbox, {
    layers: ['stops-highlighted', 'stops'],
  });

  if (!features || features.length === 0) return;

  const feature = features[0];
  showStopPopup(map, feature);
}

function showStopPopup(map, feature) {
  new maplibregl.Popup()
    .setLngLat(feature.geometry.coordinates)
    .setHTML(getStopPopupHtml(feature, stopData[feature.properties.stop_id]))
    .addTo(map);
}

function highlightStop(map, id, stopIds) {
  map.setFilter('stops-highlighted', [
    'any',
    ['in', 'stop_id', ...stopIds],
    ['in', 'parent_station', ...stopIds],
  ]);

  highlightTimetableStops(id, stopIds);
}

function unHighlightStop(map, id) {
  map.setFilter('stops-highlighted', ['==', 'stop_id', '']);
  unHighlightTimetableStops(id);
}

function highlightTimetableStops(id, stopIds) {
  const table = document.querySelector(
    `.timetable[data-timetable-id="${id}"] table`,
  );
  if (!table) return;

  const isVertical = table.dataset.orientation === 'vertical';

  if (isVertical) {
    highlightVerticalTimetableStops(id, stopIds);
  } else {
    highlightHorizontalTimetableStops(id, stopIds);
  }
}

function highlightVerticalTimetableStops(id, stopIds) {
  const table = document.querySelector(
    `.timetable[data-timetable-id="${id}"] table`,
  );
  if (!table) return;

  const columnIndexes = [];
  const allCols = Array.from(table.querySelectorAll('colgroup col'));

  for (const stopId of stopIds) {
    const col = table.querySelector(`colgroup col[data-stop-id="${stopId}"]`);
    if (col) {
      const index = allCols.indexOf(col);
      if (index !== -1) {
        columnIndexes.push(index);
      }
    }
  }

  // Remove highlighted class from all cells
  table
    .querySelectorAll('td, thead th')
    .forEach((el) => el.classList.remove('highlighted'));

  // Add highlighted class to cells in matching columns
  table.querySelectorAll('.trip-row').forEach((row) => {
    const cells = row.querySelectorAll('td');
    cells.forEach((cell, index) => {
      if (columnIndexes.includes(index)) {
        cell.classList.add('highlighted');
      }
    });
  });

  table.querySelectorAll('thead').forEach((thead) => {
    const headers = thead.querySelectorAll('th');
    headers.forEach((header, index) => {
      if (columnIndexes.includes(index)) {
        header.classList.add('highlighted');
      }
    });
  });
}

function highlightHorizontalTimetableStops(id, stopIds) {
  const table = document.querySelector(
    `.timetable[data-timetable-id="${id}"] table`,
  );
  if (!table) return;

  // Remove highlighted class from all stop rows
  table
    .querySelectorAll('.stop-row')
    .forEach((row) => row.classList.remove('highlighted'));

  // Add highlighted class to matching stop rows
  for (const stopId of stopIds) {
    const stopRow = table.querySelector(`[data-stop-id="${stopId}"]`);
    if (stopRow) {
      stopRow.classList.add('highlighted');
    }
  }
}

function unHighlightTimetableStops(id) {
  const table = document.querySelector(
    `.timetable[data-timetable-id="${id}"] table`,
  );
  if (!table) return;

  const isVertical = table.dataset.orientation === 'vertical';

  if (isVertical) {
    table
      .querySelectorAll('td, thead th')
      .forEach((el) => el.classList.remove('highlighted'));
  } else {
    table
      .querySelectorAll('.stop-row')
      .forEach((row) => row.classList.remove('highlighted'));
  }
}

function setupTableHoverListeners(id, map) {
  const table = document.querySelector(
    `.timetable[data-timetable-id="${id}"] table`,
  );
  if (!table) return;

  const cells = table.querySelectorAll('th, td');
  cells.forEach((cell) => {
    cell.addEventListener('mouseenter', (event) => {
      const stopId = getStopIdFromTableCell(event.target);
      if (stopId !== undefined) {
        highlightStop(map, id, [stopId.toString()]);
      }
    });

    cell.addEventListener('mouseleave', () => {
      unHighlightStop(map, id);
    });
  });
}

function getStopIdFromTableCell(cell) {
  const table = cell.closest('table');
  if (!table) return undefined;

  if (table.dataset.orientation === 'vertical') {
    const row = cell.parentElement;
    const cellIndex = Array.from(row.children).indexOf(cell);
    const cols = table.querySelectorAll('colgroup col');
    if (cols[cellIndex]) {
      return cols[cellIndex].dataset.stopId;
    }
  } else {
    const row = cell.closest('tr');
    if (row) {
      return row.dataset.stopId;
    }
  }

  return undefined;
}

function createMaps() {
  for (const id of Object.keys(geojsons)) {
    maps[id] = createMap(id);
  }

  // GTFS-Realtime Vehicle Positions
  if (
    !gtfsRealtimeInterval &&
    gtfsRealtimeUrls?.realtimeVehiclePositions?.url
  ) {
    // Popup for realtime vehicle locations
    const markerHeight = 20;
    const markerRadius = 10;
    const linearOffset = 15;
    vehiclePopup = new maplibregl.Popup({
      closeOnClick: false,
      className: 'vehicle-popup',
      offset: {
        top: [0, 0],
        'top-left': [0, 0],
        'top-right': [0, 0],
        bottom: [0, -markerHeight],
        'bottom-left': [
          linearOffset,
          (markerHeight - markerRadius + linearOffset) * -1,
        ],
        'bottom-right': [
          -linearOffset,
          (markerHeight - markerRadius + linearOffset) * -1,
        ],
        left: [markerRadius, (markerHeight - markerRadius) * -1],
        right: [-markerRadius, (markerHeight - markerRadius) * -1],
      },
    });

    const arrivalUpdateInterval = 10 * 1000; // 10 seconds
    updateArrivals();
    gtfsRealtimeInterval = setInterval(() => {
      updateArrivals();
    }, arrivalUpdateInterval);
  }
}
