/* global window, document, $, mapboxgl */
/* eslint no-var: "off", prefer-arrow-callback: "off", no-unused-vars: "off" */

const maps = {};

function formatRoute(route) {
  const html = route.route_url
    ? $('<a>').attr('href', route.route_url)
    : $('<div>');

  html.addClass('route-item text-sm mb-2');

  if (route.route_color) {
    $('<div>')
      .addClass('route-color-swatch mr-2 flex-shrink-0')
      .css('backgroundColor', route.route_color)
      .appendTo(html);
  }

  $('<span>')
    .text(`${route.route_short_name} ${route.route_long_name}`)
    .appendTo(html);

  return html.prop('outerHTML');
}

function formatStopPopup(feature) {
  const routes = JSON.parse(feature.properties.routes);
  const html = $('<div>');

  $('<div>')
    .addClass('popup-title')
    .text(feature.properties.stop_name)
    .appendTo(html);

  if (feature.properties.stop_code ?? false) {
    $('<label>').addClass('mr-1').text('Stop Code:').appendTo(html);

    $('<strong>').text(feature.properties.stop_code).appendTo(html);
  }

  $('<div>').text('Routes Served:').appendTo(html);

  $(html).append(routes.map((route) => formatRoute(route)));

  return html.prop('outerHTML');
}

function getBounds(geojson) {
  const bounds = new mapboxgl.LngLatBounds();
  for (const feature of geojson.features) {
    if (feature.geometry.type === 'Point') {
      bounds.extend(feature.geometry.coordinates);
    } else if (feature.geometry.type === 'LineString') {
      for (const coordinate of feature.geometry.coordinates) {
        bounds.extend(coordinate);
      }
    }
  }

  return bounds;
}

function createMap(id, geojson) {
  const defaultRouteColor = '#FF4728';

  if (!geojson || geojson.features.length === 0) {
    $('#map_' + id).hide();
    return false;
  }

  const bounds = getBounds(geojson);
  const map = new mapboxgl.Map({
    container: 'map_' + id,
    style: 'mapbox://styles/mapbox/light-v10',
    center: bounds.getCenter(),
    zoom: 12,
    preserveDrawingBuffer: true,
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

    // Find the index of the first symbol layer in the map style
    let firstSymbolId;
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'symbol') {
        firstSymbolId = layer.id;
        break;
      }
    }

    // Add route line outline first
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
          'line-width': 6,
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        filter: ['!has', 'stop_id'],
      },
      firstSymbolId
    );

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
          'line-width': 2,
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        filter: ['!has', 'stop_id'],
      },
      firstSymbolId
    );

    map.addLayer(
      {
        id: 'stops',
        type: 'circle',
        source: {
          type: 'geojson',
          data: geojson,
        },
        paint: {
          'circle-radius': {
            stops: [
              [9, 2],
              [13, 4],
              [15, 6],
            ],
          },
          'circle-stroke-width': 1,
          'circle-stroke-color': '#363636',
          'circle-color': '#363636',
        },
        filter: ['has', 'stop_id'],
      },
      firstSymbolId
    );

    map.addLayer(
      {
        id: 'stops-highlighted',
        type: 'circle',
        source: {
          type: 'geojson',
          data: geojson,
        },
        paint: {
          'circle-radius': {
            stops: [
              [9, 3],
              [13, 4],
              [15, 7],
            ],
          },
          'circle-stroke-width': 2,
          'circle-stroke-color': '#666666',
          'circle-color': '#888888',
        },
        filter: ['==', 'stop_id', ''],
      },
      firstSymbolId
    );

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
        layers: ['stops'],
      });

      if (!features || features.length === 0) {
        return;
      }

      // Get the first feature and show popup
      const feature = features[0];

      new mapboxgl.Popup()
        .setLngLat(feature.geometry.coordinates)
        .setHTML(formatStopPopup(feature))
        .addTo(map);
    });

    function highlightStop(stopId) {
      map.setFilter('stops-highlighted', ['==', 'stop_id', stopId]);
      map.setPaintProperty('stops', 'circle-opacity', 0.5);
      map.setPaintProperty('stops', 'circle-stroke-opacity', 0.5);
    }

    function unHighlightStop() {
      map.setFilter('stops-highlighted', ['==', 'stop_id', '']);
      map.setPaintProperty('stops', 'circle-opacity', 1);
      map.setPaintProperty('stops', 'circle-stroke-opacity', 1);
    }

    // On table hover, highlight stop on map
    $('th, td', $('#' + id + ' table')).hover((event) => {
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

  maps[id] = map;
}
