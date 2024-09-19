/* global document, jQuery, mapboxgl, Pbf, stopData, routeData, routeIds, tripIds, geojsons, gtfsRealtimeUrls */
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
    ? jQuery('<a>').attr('href', route.route_url)
    : jQuery('<div>');

  html.addClass('map-route-item');

  // Only add color swatch if route has a color
  const routeItemDivs = [];

  if (route.route_color) {
    routeItemDivs.push(
      jQuery('<div>')
        .addClass('route-color-swatch')
        .css('backgroundColor', formatRouteColor(route))
        .css('color', formatRouteTextColor(route))
        .text(route.route_short_name ?? ''),
    );
  }
  routeItemDivs.push(
    jQuery('<div>')
      .addClass('underline-hover')
      .text(route.route_long_name ?? `Route ${route.route_short_name}`),
  );

  html.append(routeItemDivs);

  return html.prop('outerHTML');
}

function getStopPopupHtml(feature, stop) {
  const routeIds = JSON.parse(feature.properties.route_ids);
  const html = jQuery('<div>');

  jQuery('<div>').addClass('popup-title').text(stop.stop_name).appendTo(html);

  if (stop.stop_code ?? false) {
    jQuery('<div>')
      .html([
        jQuery('<label>').addClass('popup-label').text('Stop Code:'),
        jQuery('<strong>').text(stop.stop_code),
      ])
      .appendTo(html);
  }

  jQuery('<label>').text('Routes Served:').appendTo(html);

  jQuery(html).append(
    jQuery('<div>')
      .addClass('route-list')
      .html(routeIds.map((routeId) => formatRoute(routeData[routeId]))),
  );

  jQuery('<a>')
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
  const html = jQuery('<div>');

  const lastUpdated = new Date(vehiclePosition.vehicle.timestamp * 1000);
  const directionName = jQuery(
    '.timetable #trip_id_' + vehiclePosition.vehicle.trip.trip_id,
  )
    .parents('.timetable')
    .data('direction-name');

  if (directionName) {
    jQuery('<div>')
      .addClass('popup-title')
      .text(`Vehicle: ${directionName}`)
      .appendTo(html);
  }

  const movingText = formatMovingText(vehiclePosition);

  if (movingText) {
    jQuery('<div>').text(movingText).appendTo(html);
  }

  jQuery('<div>')
    .append(
      jQuery('<small>').text(`Updated: ${lastUpdated.toLocaleTimeString()}`),
    )
    .appendTo(html);

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
    jQuery('<div>')
      .append(jQuery('<small>').text('Upcoming Stops:'))
      .appendTo(html);

    jQuery('<div>')
      .addClass('upcoming-stops')
      .append(
        nextArrivals.flatMap((arrival) => {
          let delay = '';

          if (arrival.delay > 0) {
            delay = `(${formatSeconds(arrival.delay)} behind schedule)`;
          } else if (arrival.delay < 0) {
            delay = `(${formatSeconds(arrival.delay)} ahead of schedule)`;
          }

          return [
            jQuery('<div>').text(formatSeconds(arrival.secondsToArrival)),
            jQuery('<div>').text(`${arrival.stopName} ${delay}`),
          ];
        }),
      )
      .appendTo(html);
  }

  return html.prop('outerHTML');
}

function addVehicleMarker(vehiclePosition, vehicleTripUpdate) {
  if (!vehiclePosition.vehicle || !vehiclePosition.vehicle.position) {
    return;
  }

  const visibleTimetableId = jQuery('.timetable:visible').data('timetable-id');

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
  const visibleTimetableId = jQuery('.timetable:visible').data('timetable-id');

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
      jQuery('.vehicle-legend-item').hide();
      return;
    }

    jQuery('.vehicle-legend-item').show();

    vehiclePositions = latestVehiclePositions;
    tripUpdates = latestTripUpdates;

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
    // Resize the map to fit the visible area
    maps[id].resize();

    // Update vehicle markers to use the current visible map
    for (const [vehicleId, vehicleMarker] of Object.entries(vehicleMarkers)) {
      const coordinates = vehicleMarker.getLngLat();

      // Remove previous event listeners
      vehicleMarker
        .getElement()
        .removeEventListener(
          'mouseenter',
          vehicleMarkersEventListeners[vehicleId],
        );

      const vehiclePosition = vehiclePositions.find(
        (vehiclePosition) => vehiclePosition.vehicle.vehicle.id === vehicleId,
      );

      const tripUpdate = tripUpdates.find(
        (tripUpdate) => tripUpdate.trip_update.vehicle.id === vehicleId,
      );

      // Update event listener function to use the new map
      vehicleMarkersEventListeners[vehicleId] = () => {
        vehiclePopup
          .setLngLat(coordinates)
          .setHTML(getVehiclePopupHtml(vehiclePosition, tripUpdate))
          .addTo(maps[id]);
      };

      // Add updated event listener to marker
      vehicleMarker
        .getElement()
        .addEventListener(
          'mouseenter',
          vehicleMarkersEventListeners[vehicleId],
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
    jQuery(`#map_timetable_id_${id}`).hide();
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
        const stopIds = [features[0].properties.stop_id];
        if (features[0].properties.parent_station) {
          stopIds.push(features[0].properties.parent_station);
        }

        highlightStop(stopIds);
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
        .setHTML(
          getStopPopupHtml(feature, stopData[feature.properties.stop_id]),
        )
        .addTo(map);
    });

    function highlightStop(stopIds) {
      map.setFilter('stops-highlighted', [
        'any',
        ['in', 'stop_id', ...stopIds],
        ['in', 'parent_station', ...stopIds],
      ]);

      if (
        jQuery(`#timetable_id_${id} table`).data('orientation') === 'vertical'
      ) {
        const columnIndexes = [];
        const stopIdSelectors = stopIds
          .map(
            (stopId) =>
              `#timetable_id_${id} table colgroup col[data-stop-id="${stopId}"]`,
          )
          .join(',');
        jQuery(stopIdSelectors).each((index, col) => {
          columnIndexes.push(
            jQuery(`#timetable_id_${id} table colgroup col`).index(col),
          );
        });

        jQuery(`#timetable_id_${id} table .stop-time`).removeClass(
          'highlighted',
        );
        jQuery(`#timetable_id_${id} table thead .stop-header`).removeClass(
          'highlighted',
        );
        jQuery(`#timetable_id_${id} table .trip-row`).each((index, row) => {
          jQuery('.stop-time', row).each((index, el) => {
            if (columnIndexes.includes(index)) {
              jQuery(el).addClass('highlighted');
            }
          });
        });

        jQuery(`#timetable_id_${id} table thead`).each((index, thead) => {
          jQuery('.stop-header', thead).each((index, el) => {
            if (columnIndexes.includes(index)) {
              jQuery(el).addClass('highlighted');
            }
          });
        });
      } else {
        jQuery(`#timetable_id_${id} table .stop-row`).removeClass(
          'highlighted',
        );
        const stopIdSelectors = stopIds
          .map((stopId) => `#timetable_id_${id} table #stop_id_${stopId}`)
          .join(',');
        jQuery(stopIdSelectors).addClass('highlighted');
      }
    }

    function unHighlightStop() {
      map.setFilter('stops-highlighted', ['==', 'stop_id', '']);

      if (
        jQuery(`#timetable_id_${id} table`).data('orientation') === 'vertical'
      ) {
        jQuery(`#timetable_id_${id} table .stop-time`).removeClass(
          'highlighted',
        );
        jQuery(`#timetable_id_${id} table thead .stop-header`).removeClass(
          'highlighted',
        );
      } else {
        jQuery(`#timetable_id_${id} table .stop-row`).removeClass(
          'highlighted',
        );
      }
    }

    // On table hover, highlight stop on map
    jQuery('th, td', jQuery(`#timetable_id_${id} table`)).hover((event) => {
      let stopId;
      const table = jQuery(event.target).parents('table');
      if (table.data('orientation') === 'vertical') {
        var index = jQuery(event.target).index();
        stopId = jQuery('colgroup col', table).eq(index).data('stop-id');
      } else {
        stopId = jQuery(event.target).parents('tr').data('stop-id');
      }

      if (stopId === undefined) {
        return;
      }

      highlightStop([stopId.toString()]);
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
