/* global window, document, $, mapboxgl */
/* eslint no-var: "off", prefer-arrow-callback: "off", no-unused-vars: "off" */

const maps = {};

function formatRouteColor(route) {
  return route.route_color || '#000000';
}

function formatRouteTextColor(route) {
  return route.route_text_color || '#FFFFFF';
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

function formatStopPopup(feature, routes) {
  const routeIds = JSON.parse(feature.properties.routes);
  const html = $('<div>');

  $('<div>')
    .addClass('popup-title')
    .text(feature.properties.stop_name)
    .appendTo(html);

  if (feature.properties.stop_code ?? false) {
    $('<div>')
      .html([
        $('<label>').addClass('popup-label').text('Stop Code:'),
        $('<strong>').text(feature.properties.stop_code),
      ])
      .appendTo(html);
  }

  $('<label>').text('Routes Served:').appendTo(html);

  $(html).append(
    $('<div>')
      .addClass('route-list')
      .html(routeIds.map((routeId) => formatRoute(routes[routeId]))),
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

function createMap(id, geojson, routes) {
  const defaultRouteColor = '#000000';
  const lineLayout = {
    'line-join': 'round',
    'line-cap': 'round',
  };

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
        .setHTML(formatStopPopup(feature, routes))
        .addTo(map);
    });

    function highlightStop(stopId) {
      map.setFilter('stops-highlighted', ['==', 'stop_id', stopId]);
    }

    function unHighlightStop() {
      map.setFilter('stops-highlighted', ['==', 'stop_id', '']);
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
