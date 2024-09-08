/* global window, document, $, mapboxgl, Pbf, stopData, routeData, routeIds, tripIds, geojsons, gtfsRealtimeUrls */
/* eslint no-var: "off", prefer-arrow-callback: "off", no-unused-vars: "off" */

const maps = {};
const vehicleMarkers = {};
const vehicleMarkersEventListeners = {};
let vehiclePopup;
let gtfsRealtimeInterval;

function formatRouteColor(route) {
  return route.route_color || '#000000';
}

function formatRouteTextColor(route) {
  return route.route_text_color || '#FFFFFF';
}

function degToCompass(num) {
  var val = Math.floor(num / 22.5 + 0.5);
  var arr = [
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
    ? $('<a>').attr('href', route.route_url)
    : $('<div>');

  html.addClass('map-route-item');

  // Only add color swatch if route has a color
  const routeItemDivs = [];

  if (route.route_color) {
    routeItemDivs.push(
      $('<div>')
        .addClass('route-color-swatch')
        .css('backgroundColor', formatRouteColor(route))
        .css('color', formatRouteTextColor(route))
        .text(route.route_short_name ?? ''),
    );
  }
  routeItemDivs.push(
    $('<div>')
      .addClass('underline-hover')
      .text(route.route_long_name ?? `Route ${route.route_short_name}`),
  );

  html.append(routeItemDivs);

  return html.prop('outerHTML');
}

function formatStopPopup(feature, stop) {
  const routeIds = JSON.parse(feature.properties.route_ids);
  const html = $('<div>');

  $('<div>').addClass('popup-title').text(stop.stop_name).appendTo(html);

  if (stop.stop_code ?? false) {
    $('<div>')
      .html([
        $('<label>').addClass('popup-label').text('Stop Code:'),
        $('<strong>').text(stop.stop_code),
      ])
      .appendTo(html);
  }

  $('<label>').text('Routes Served:').appendTo(html);

  $(html).append(
    $('<div>')
      .addClass('route-list')
      .html(routeIds.map((routeId) => formatRoute(routeData[routeId]))),
  );

  $('<a>')
    .addClass('btn-blue btn-sm')
    .prop(
      'href',
      `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${feature.geometry.coordinates[1]},${feature.geometry.coordinates[0]}&heading=0&pitch=0&fov=90`,
    )
    .prop('target', '_blank')
    .prop('rel', 'noopener noreferrer')
    .html('View on Streetview')
    .appendTo(html);

  return html.prop('outerHTML');
}

function getBounds(geojson) {
  const bounds = new mapboxgl.LngLatBounds();
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
  // Takes a dateString in the format of "YYYYMMDD HH:mm:ss" and returns true if the date is more than 15 minutes in the future

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

function getVehiclePopupHtml(vehiclePosition, vehicleTripUpdate) {
  const lastUpdated = new Date(vehiclePosition.vehicle.timestamp * 1000);
  const directionName = $(
    '.timetable #trip_id_' + vehiclePosition.vehicle.trip.trip_id,
  )
    .parents('.timetable')
    .data('direction-name');

  const descriptionArray = [];

  if (directionName) {
    descriptionArray.push(`<div class="popup-title">${directionName}</div>`);
  }

  let movingText = '';

  if (
    vehiclePosition.vehicle.position.bearing !== undefined &&
    vehiclePosition.vehicle.position.bearing !== 0
  ) {
    movingText += `Moving: ${degToCompass(vehiclePosition.vehicle.position.bearing)}`;
  }
  if (vehiclePosition.vehicle.position.speed) {
    movingText += ` at ${formatSpeed(metersPerSecondToMph(vehiclePosition.vehicle.position.speed))}`;
  }

  if (movingText) {
    descriptionArray.push(`<div>${movingText}</div>`);
  }

  descriptionArray.push(
    `<div><small>Updated: ${lastUpdated.toLocaleTimeString()}</small></div>`,
  );

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

        if (nextArrivals.length >= 3) {
          break;
        }
      }
    }
  }

  if (nextArrivals.length > 0) {
    descriptionArray.push('<div><strong>Upcoming Stops: </strong></div>');

    for (const arrival of nextArrivals) {
      let delay = '';

      if (arrival.delay > 0) {
        delay = `<span class="delay">${formatSeconds(arrival.delay)} late</span>`;
      } else if (arrival.delay < 0) {
        delay = `<span class="delay">${formatSeconds(arrival.delay)} early</span>`;
      }
      descriptionArray.push(
        `<div>${arrival.stopName} in <strong>${formatSeconds(arrival.secondsToArrival)}</strong> ${delay}</div>`,
      );
    }
  }

  return descriptionArray.join('');
}

function addVehicleMarker(vehiclePosition, vehicleTripUpdate) {
  if (!vehiclePosition.vehicle || !vehiclePosition.vehicle.position) {
    return;
  }

  const visibleTimetableId = $('.timetable:visible').data('timetable-id');

  // Create a DOM element for each marker
  const el = document.createElement('div');
  el.className = 'vehicle-marker';
  el.style.width = '20px';
  el.style.height = '20px';
  el.innerHTML = `<div class="vehicle-marker-arrow" aria-hidden="true" style="transform:rotate(${vehiclePosition.vehicle.position.bearing}deg)"></div>`;

  const coordinates = [
    vehiclePosition.vehicle.position.longitude,
    vehiclePosition.vehicle.position.latitude,
  ];

  vehicleMarkersEventListeners[vehiclePosition.vehicle.vehicle.id] = () => {
    vehiclePopup
      .setLngLat(coordinates)
      .setHTML(getVehiclePopupHtml(vehiclePosition, vehicleTripUpdate))
      .addTo(maps[visibleTimetableId]);
  };

  // Vehicle marker popups
  el.addEventListener(
    'mouseenter',
    vehicleMarkersEventListeners[vehiclePosition.vehicle.vehicle.id],
  );

  el.addEventListener('mouseleave', () => {
    vehiclePopup.remove();
  });

  // Add marker to map
  const marker = new mapboxgl.Marker(el)
    .setLngLat(coordinates)
    .addTo(maps[visibleTimetableId]);

  return marker;
}

function animateVehicleMarker(vehicleMarker, newCoordinates) {
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
    vehiclePopup.setLngLat([newLongitude, newLatitude]);

    if (safeProgress != 1) {
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
  const visibleTimetableId = $('.timetable:visible').data('timetable-id');

  const coordinates = [
    vehiclePosition.vehicle.position.longitude,
    vehiclePosition.vehicle.position.latitude,
  ];
  vehicleMarker.getElement().innerHTML = `<div class="vehicle-marker-arrow" aria-hidden="true" style="transform:rotate(${vehiclePosition.vehicle.position.bearing}deg)"></div>`;

  vehicleMarker
    .getElement()
    .removeEventListener(
      'mouseenter',
      vehicleMarkersEventListeners[vehiclePosition.vehicle.vehicle.id],
    );

  vehicleMarkersEventListeners[vehiclePosition.vehicle.vehicle.id] = () => {
    vehiclePopup
      .setLngLat(coordinates)
      .setHTML(getVehiclePopupHtml(vehiclePosition, vehicleTripUpdate))
      .addTo(maps[visibleTimetableId]);
  };

  vehicleMarker
    .getElement()
    .addEventListener(
      'mouseenter',
      vehicleMarkersEventListeners[vehiclePosition.vehicle.vehicle.id],
    );

  animateVehicleMarker(vehicleMarker, coordinates);
}

async function fetchGtfsRealtime(url, headers) {
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

  if (!realtimeVehiclePositions || !realtimeTripUpdates) {
    return;
  }

  try {
    const [vehiclePositions, tripUpdates] = await Promise.all([
      fetchGtfsRealtime(
        realtimeVehiclePositions.url,
        realtimeVehiclePositions.headers,
      ),
      fetchGtfsRealtime(realtimeTripUpdates.url, realtimeTripUpdates.headers),
    ]);

    if (!vehiclePositions.length) {
      $('.vehicle-legend-item').hide();
      return;
    }
    $('.vehicle-legend-item').show();

    const routeVehiclePositions = vehiclePositions.filter((vehiclePosition) => {
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

    for (const vehiclePosition of routeVehiclePositions) {
      const vehicleId = vehiclePosition.vehicle.vehicle.id;

      let vehicleTripUpdate = tripUpdates.find(
        (tripUpdate) =>
          tripUpdate.trip_update.trip.trip_id ===
          vehiclePosition.vehicle.trip.trip_id,
      );

      if (!vehicleTripUpdate) {
        vehicleTripUpdate = tripUpdates.find(
          (tripUpdate) => tripUpdate.trip_update.vehicle.id === vehicleId,
        );
      }

      let vehicleMarker = vehicleMarkers[vehicleId];

      // If not on map, add it
      if (vehicleMarker === undefined) {
        vehicleMarkers[vehicleId] = addVehicleMarker(
          vehiclePosition,
          vehicleTripUpdate,
        );
      } else {
        // Otherwise update location
        updateVehicleMarkerLocation(
          vehicleMarker,
          vehiclePosition,
          vehicleTripUpdate,
        );
      }
    }

    // Remove vehicles not in the feed
    for (const vehicleId of Object.keys(vehicleMarkers)) {
      if (
        !routeVehiclePositions.find(
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
    maps[id].resize();

    for (const vehicleMarker of Object.values(vehicleMarkers)) {
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
    $(`#map_timetable_id_${id}`).hide();
    return false;
  }

  const bounds = getBounds(geojson);
  const map = new mapboxgl.Map({
    container: `map_timetable_id_${id}`,
    style: 'mapbox://styles/mapbox/light-v11',
    center: bounds.getCenter(),
    zoom: 12,
    preserveDrawingBuffer: true,
  });

  map.initialize = () =>
    map.fitBounds(bounds, {
      padding: {
        top: 40,
        bottom: 40,
        left: 20,
        right: 40,
      },
      duration: 0,
    });

  map.scrollZoom.disable();
  map.addControl(new mapboxgl.NavigationControl());

  map.on('load', () => {
    map.fitBounds(bounds, {
      padding: {
        top: 40,
        bottom: 40,
        left: 20,
        right: 40,
      },
      duration: 0,
    });

    // Turn off Points of Interest labels
    map.setLayoutProperty('poi-label', 'visibility', 'none');

    // Find the index of the first symbol layer in the map style to put the route lines underneath
    let firstSymbolId;
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'symbol') {
        firstSymbolId = layer.id;
        break;
      }
    }

    // Add route drop shadow outline first
    map.addLayer(
      {
        id: 'route-line-shadow',
        type: 'line',
        source: {
          type: 'geojson',
          data: geojson,
        },
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

    // Add route line outline
    map.addLayer(
      {
        id: 'route-line-outline',
        type: 'line',
        source: {
          type: 'geojson',
          data: geojson,
        },
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

    // Add route line
    map.addLayer(
      {
        id: 'route-line',
        type: 'line',
        source: {
          type: 'geojson',
          data: geojson,
        },
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

    // Add stops
    map.addLayer({
      id: 'stops',
      type: 'circle',
      source: {
        type: 'geojson',
        data: geojson,
      },
      paint: {
        'circle-color': '#fff',
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

    // Layer for highlighted stops
    map.addLayer({
      id: 'stops-highlighted',
      type: 'circle',
      source: {
        type: 'geojson',
        data: geojson,
      },
      paint: {
        'circle-color': '#fff',
        'circle-radius': {
          base: 1.75,
          stops: [
            [12, 5],
            [22, 125],
          ],
        },
        'circle-stroke-width': 2,
        'circle-stroke-color': '#3f4a5c',
      },
      filter: ['==', 'stop_id', ''],
    });

    map.on('mousemove', (event) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: ['stops'],
      });
      if (features.length > 0) {
        map.getCanvas().style.cursor = 'pointer';
        highlightStop(features[0].properties.stop_id);
      } else {
        map.getCanvas().style.cursor = '';
        unHighlightStop();
      }
    });

    map.on('click', (event) => {
      // Set bbox as 5px rectangle area around clicked point
      const bbox = [
        [event.point.x - 5, event.point.y - 5],
        [event.point.x + 5, event.point.y + 5],
      ];
      const features = map.queryRenderedFeatures(bbox, {
        layers: ['stops-highlighted', 'stops'],
      });

      if (!features || features.length === 0) {
        return;
      }

      // Get the first feature and show popup
      const feature = features[0];

      new mapboxgl.Popup()
        .setLngLat(feature.geometry.coordinates)
        .setHTML(formatStopPopup(feature, stopData[feature.properties.stop_id]))
        .addTo(map);
    });

    function highlightStop(stopId) {
      map.setFilter('stops-highlighted', ['==', 'stop_id', stopId]);
    }

    function unHighlightStop() {
      map.setFilter('stops-highlighted', ['==', 'stop_id', '']);
    }

    // On table hover, highlight stop on map
    $('th, td', $(`#timetable_id_${id} table`)).hover((event) => {
      let stopId;
      const table = $(event.target).parents('table');
      if (table.data('orientation') === 'vertical') {
        var index = $(event.target).index();
        stopId = $('colgroup col', table).eq(index).data('stop-id');
      } else {
        stopId = $(event.target).parents('tr').data('stop-id');
      }

      if (stopId === undefined) {
        return;
      }

      highlightStop(stopId.toString());
    }, unHighlightStop);
  });

  return map;
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
    vehiclePopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'vehicle-popup',
      offset: [0, -10],
    });

    const arrivalUpdateInterval = 10 * 1000; // 10 seconds
    updateArrivals();
    gtfsRealtimeInterval = setInterval(() => {
      updateArrivals();
    }, arrivalUpdateInterval);
  }
}
