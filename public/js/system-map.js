/* global window, document, _, $, mapboxgl */
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

function formatRoutePopup(features) {
  const html = $('<div>');

  if (features.length > 1) {
    $('<div>').addClass('popup-title').text('Routes').appendTo(html);
  }

  $(html).append(features.map((feature) => formatRoute(feature.properties)));

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

function createSystemMap(id, geojson) {
  const defaultRouteColor = '#FF4728';
  const lineLayout = {
    'line-join': 'round',
    'line-cap': 'round',
  };

  if (!geojson || geojson.features.length === 0) {
    $('#' + id).hide();
    return false;
  }

  const bounds = getBounds(geojson);
  const map = new mapboxgl.Map({
    container: id,
    style: 'mapbox://styles/mapbox/light-v10',
    center: bounds.getCenter(),
    zoom: 12,
  });
  const routes = {};

  for (const feature of geojson.features) {
    routes[feature.properties.route_id] = feature.properties;
  }

  map.scrollZoom.disable();
  map.addControl(new mapboxgl.NavigationControl());

  map.on('load', () => {
    map.fitBounds(bounds, {
      padding: 20,
      duration: 0,
    });

    // Turn of Points of Interest labels
    map.setLayoutProperty('poi-label', 'visibility', 'none');

    // Find the index of the first symbol layer in the map style
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
        id: 'route-line-shadows',
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
      firstSymbolId
    );

    // Add highlighted route drop shadow outlines next
    map.addLayer(
      {
        id: 'highlighted-route-line-shadows',
        type: 'line',
        source: {
          type: 'geojson',
          data: geojson,
        },
        paint: {
          'line-color': '#000000',
          'line-opacity': 0.3,
          'line-width': {
            base: 16,
            stops: [
              [14, 24],
              [18, 50],
            ],
          },
          'line-blur': {
            base: 16,
            stops: [
              [14, 24],
              [18, 50],
            ],
          },
        },
        layout: lineLayout,
        filter: ['==', ['get', 'route_id'], 'none'],
      },
      firstSymbolId
    );

    // Add white outlines to routes next
    map.addLayer(
      {
        id: `route-outlines`,
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
        filter: ['has', 'route_id'],
      },
      firstSymbolId
    );

    // Add highlighted route white outlines next
    map.addLayer(
      {
        id: `highlighted-route-outlines`,
        type: 'line',
        source: {
          type: 'geojson',
          data: geojson,
        },
        paint: {
          'line-color': '#FFFFFF',
          'line-opacity': 1,
          'line-width': {
            base: 10,
            stops: [
              [14, 16],
              [18, 40],
            ],
          },
        },
        layout: lineLayout,
        filter: ['==', ['get', 'route_id'], 'none'],
      },
      firstSymbolId
    );

    // Add route lines next
    map.addLayer(
      {
        id: 'routes',
        type: 'line',
        source: {
          type: 'geojson',
          data: geojson,
        },
        paint: {
          'line-color': ['coalesce', ['get', 'route_color'], defaultRouteColor],
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
        filter: ['has', 'route_id'],
      },
      firstSymbolId
    );

    // Add highlighted route lines next
    map.addLayer(
      {
        id: 'highlighted-routes',
        type: 'line',
        source: {
          type: 'geojson',
          data: geojson,
        },
        paint: {
          'line-color': ['coalesce', ['get', 'route_color'], defaultRouteColor],
          'line-opacity': 1,
          'line-width': {
            base: 6,
            stops: [
              [14, 8],
              [18, 20],
            ],
          },
        },
        layout: lineLayout,
        filter: ['==', ['get', 'route_id'], 'none'],
      },
      firstSymbolId
    );

    // Add stops when zoomed in
    map.addLayer(
      {
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
          'circle-stroke-color': '#3F4A5C',
          'circle-stroke-width': 2,
          'circle-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            0,
            13.5,
            1,
          ],
          'circle-stroke-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            0,
            13.5,
            1,
          ],
        },
        filter: ['has', 'stop_id'],
      },
      firstSymbolId
    );

    // Layer for highlighted stops
    map.addLayer(
      {
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
          'circle-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            0,
            13.5,
            1,
          ],
          'circle-stroke-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            0,
            13.5,
            1,
          ],
        },
        filter: ['==', 'stop_id', ''],
      },
      firstSymbolId
    );

    // Add labels
    map.addLayer({
      id: 'route-labels',
      type: 'symbol',
      source: {
        type: 'geojson',
        data: geojson,
      },
      layout: {
        'symbol-placement': 'line',
        'text-field': ['get', 'route_short_name'],
        'text-size': 14,
      },
      paint: {
        'text-color': '#000000',
        'text-halo-width': 2,
        'text-halo-color': '#ffffff',
      },
      filter: ['has', 'route_short_name'],
    });

    map.on('mousemove', (event) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: ['routes', 'route-outlines', 'stops-highlighted', 'stops'],
      });
      if (features.length > 0) {
        map.getCanvas().style.cursor = 'pointer';
        highlightRoutes(
          _.compact(
            _.uniq(features.map((feature) => feature.properties.route_id))
          )
        );

        if (features.some((feature) => feature.layer.id === 'stops')) {
          highlightStop(
            features.find((feature) => feature.layer.id === 'stops').properties
              .stop_id
          );
        }
      } else {
        map.getCanvas().style.cursor = '';
        unHighlightRoutes();
        unHighlightStop();
      }
    });

    map.on('click', (event) => {
      // Set bbox as 5px rectangle area around clicked point
      const bbox = [
        [event.point.x - 5, event.point.y - 5],
        [event.point.x + 5, event.point.y + 5],
      ];

      const stopFeatures = map.queryRenderedFeatures(bbox, {
        layers: ['stops-highlighted', 'stops'],
      });

      if (stopFeatures && stopFeatures.length > 0) {
        // Get the stop feature and show popup
        const stopFeature = stopFeatures[0];

        new mapboxgl.Popup()
          .setLngLat(stopFeature.geometry.coordinates)
          .setHTML(formatStopPopup(stopFeature))
          .addTo(map);
      } else {
        const routeFeatures = map.queryRenderedFeatures(bbox, {
          layers: ['routes', 'route-outlines'],
        });

        if (routeFeatures && routeFeatures.length > 0) {
          const routes = _.orderBy(
            _.uniqBy(
              routeFeatures,
              (feature) => feature.properties.route_short_name
            ),
            (feature) =>
              Number.parseInt(feature.properties.route_short_name, 10)
          );

          new mapboxgl.Popup()
            .setLngLat(event.lngLat)
            .setHTML(formatRoutePopup(routes))
            .addTo(map);
        }
      }
    });

    function highlightStop(stopId) {
      map.setFilter('stops-highlighted', ['==', 'stop_id', stopId]);
    }

    function unHighlightStop() {
      map.setFilter('stops-highlighted', ['==', 'stop_id', '']);
    }

    function highlightRoutes(routeIds, zoom) {
      map.setFilter('highlighted-routes', [
        'all',
        ['has', 'route_short_name'],
        ['in', ['get', 'route_id'], ['literal', routeIds]],
      ]);
      map.setFilter('highlighted-route-outlines', [
        'all',
        ['has', 'route_short_name'],
        ['in', ['get', 'route_id'], ['literal', routeIds]],
      ]);
      map.setFilter('highlighted-route-line-shadows', [
        'all',
        ['has', 'route_short_name'],
        ['in', ['get', 'route_id'], ['literal', routeIds]],
      ]);

      // Show labels only for highlighted route
      map.setFilter('route-labels', [
        'in',
        ['get', 'route_id'],
        ['literal', routeIds],
      ]);

      const routeLineOpacity = 0.4;

      // De-emphasize other routes
      map.setPaintProperty('routes', 'line-opacity', routeLineOpacity);
      map.setPaintProperty('route-outlines', 'line-opacity', routeLineOpacity);
      map.setPaintProperty(
        'route-line-shadows',
        'line-opacity',
        routeLineOpacity
      );

      const highlightedFeatures = geojson.features.filter((feature) =>
        routeIds.includes(feature.properties.route_id)
      );

      if (highlightedFeatures.length > 0 && zoom) {
        const zoomBounds = getBounds({
          features: highlightedFeatures,
        });
        map.fitBounds(zoomBounds, {
          padding: 20,
        });
      }
    }

    function unHighlightRoutes(zoom) {
      map.setFilter('highlighted-routes', ['==', ['get', 'route_id'], 'none']);
      map.setFilter('highlighted-route-outlines', [
        '==',
        ['get', 'route_id'],
        'none',
      ]);
      map.setFilter('highlighted-route-line-shadows', [
        '==',
        ['get', 'route_id'],
        'none',
      ]);

      // Show labels for all routes
      map.setFilter('route-labels', ['has', 'route_short_name']);

      const routeLineOpacity = 1;

      // Re-emphasize other routes
      map.setPaintProperty('routes', 'line-opacity', routeLineOpacity);
      map.setPaintProperty('route-outlines', 'line-opacity', routeLineOpacity);
      map.setPaintProperty(
        'route-line-shadows',
        'line-opacity',
        routeLineOpacity
      );

      if (zoom) {
        map.fitBounds(bounds);
      }
    }

    // On table hover, highlight route on map
    $(() => {
      $('.overview-list a').hover((event) => {
        const routeIdString = $(event.target).data('route-ids');
        if (routeIdString) {
          const routeIds = routeIdString.toString().split(',');
          highlightRoutes(routeIds, true);
        }
      });

      $('.overview-list').hover(
        () => {},
        () => unHighlightRoutes(true)
      );
    });
  });

  maps[id] = map;
}
