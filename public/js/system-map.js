/* global window, document, _, $, mapboxgl */
/* eslint no-var: "off", prefer-arrow-callback: "off", no-unused-vars: "off" */

const maps = {};

function formatRoute(route) {
  let html;

  if (route.route_url) {
    html = $('<a>')
      .attr('href', route.route_url)
      .addClass('route-item');
  } else {
    html = $('<div>')
      .addClass('route-item');
  }

  if (route.route_color) {
    $('<div>')
      .addClass('route-color-swatch')
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
    $('<div>')
      .addClass('popup-title')
      .text('Routes')
      .appendTo(html);
  }

  $(html).append(features.map(feature => formatRoute(feature.properties)));

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
  const routeLayerIds = [];

  if (!geojson || geojson.features.length === 0) {
    $('#' + id).hide();
    return false;
  }

  const headerHeight = 65;
  $('#' + id).height($(window).height() - headerHeight);
  $('.overview-list').height($(window).height() - headerHeight);

  const bounds = getBounds(geojson);
  const map = new mapboxgl.Map({
    container: id,
    style: 'mapbox://styles/mapbox/light-v10',
    center: bounds.getCenter(),
    zoom: 12
  });
  const routes = {};

  for (const feature of geojson.features) {
    routes[feature.properties.route_id] = feature.properties;
  }

  map.scrollZoom.disable();
  map.addControl(new mapboxgl.NavigationControl());

  map.on('load', () => {
    map.fitBounds(bounds, {
      padding: 20
    });

    for (const routeId of Object.keys(routes)) {
      routeLayerIds.push(routeId);
      const routeColor = routes[routeId].route_color || defaultRouteColor;
      map.addLayer({
        id: routeId,
        type: 'line',
        source: {
          type: 'geojson',
          data: geojson
        },
        paint: {
          'line-color': routeColor,
          'line-opacity': 0.7,
          'line-width': {
            stops: [
              [9, 3],
              [13, 6]
            ]
          }
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        filter: ['==', 'route_id', routeId]
      });

      map.on('mouseenter', routeId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', routeId, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    map.addLayer({
      id: 'routes-label',
      type: 'symbol',
      source: {
        type: 'geojson',
        data: geojson
      },
      layout: {
        'text-field': '{route_short_name}',
        'text-font': [
          'DIN Offc Pro Medium',
          'Arial Unicode MS Bold'
        ],
        'text-size': 14
      },
      filter: ['==', 'route_id', '']
    });

    map.on('click', event => {
      // Set bbox as 5px reactangle area around clicked point
      const bbox = [
        [event.point.x - 5, event.point.y - 5],
        [event.point.x + 5, event.point.y + 5]
      ];
      const features = map.queryRenderedFeatures(bbox, {
        layers: routeLayerIds
      });

      if (!features || features.length === 0) {
        return;
      }

      var routeFeatures = _.orderBy(
        _.uniqBy(
          features,
          feature => feature.properties.route_short_name
        ),
        feature => Number.parseInt(feature.properties.route_short_name, 10)
      );

      new mapboxgl.Popup()
        .setLngLat(event.lngLat)
        .setHTML(formatRoutePopup(routeFeatures))
        .addTo(map);
    });

    function highlightRoutes(routeIds) {
      for (const layerId of routeLayerIds) {
        const lineOpacity = routeIds.includes(layerId) ? 1 : 0.1;
        map.setPaintProperty(layerId, 'line-opacity', lineOpacity);
      }

      map.setFilter('routes-label', ['in', 'route_id'].concat(routeIds));

      const highlightedFeatures = geojson.features.filter(feature => routeIds.includes(feature.properties.route_id));

      if (highlightedFeatures.length === 0) {
        return;
      }

      const zoomBounds = getBounds({
        features: highlightedFeatures
      });
      map.fitBounds(zoomBounds, {
        padding: 20
      });
    }

    function unHighlightRoutes() {
      for (const layerId of routeLayerIds) {
        map.setPaintProperty(layerId, 'line-opacity', 0.7);
      }

      map.setFilter('routes-label', ['==', 'route_id', '']);
      map.fitBounds(bounds);
    }

    // On table hover, highlight route on map
    $(() => {
      $('.list-group-item').hover(event => {
        var routeIds = $(event.target).data('route-ids').toString().split(',');
        highlightRoutes(routeIds);
      }, unHighlightRoutes);
    });
  });

  maps[id] = map;
}
