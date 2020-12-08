/* global window, document, _, $, mapboxgl */
/* eslint no-var: "off", prefer-arrow-callback: "off", no-unused-vars: "off" */

const maps = {};

function formatRoute(route) {
  const html = route.route_url ? $('<a>').attr('href', route.route_url) : $('<div>');

  html.addClass('route-item text-sm pb-2');

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
  const routeBackgroundLayerIds = [];

  if (!geojson || geojson.features.length === 0) {
    $('#' + id).hide();
    return false;
  }

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

    // Add white outlines to routes first
    for (const routeId of Object.keys(routes)) {
      routeBackgroundLayerIds.push(`${routeId}outline`);
      map.addLayer({
        id: `${routeId}outline`,
        type: 'line',
        source: {
          type: 'geojson',
          data: geojson
        },
        paint: {
          'line-color': '#FFFFFF',
          'line-opacity': 1,
          'line-width': 6
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        filter: ['==', 'route_id', routeId]
      });
    }

    // Add route lines next
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
          'line-opacity': 1,
          'line-width': 2
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        filter: ['==', 'route_id', routeId]
      });
    }

    map.on('mousemove', (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: [...routeLayerIds, ...routeBackgroundLayerIds] });
      if (features.length > 0) {
        map.getCanvas().style.cursor = 'pointer';
        highlightRoutes(_.uniq(features.map(feature => feature.properties.route_id)));
      } else {
        map.getCanvas().style.cursor = '';
        unHighlightRoutes();
      }
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

      const routeFeatures = _.orderBy(
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

    function highlightRoutes(routeIds, zoom) {
      for (const layerId of routeBackgroundLayerIds) {
        const color = routeIds.includes(layerId.replace(/outline/, '')) ? '#FFFD7E' : '#FFFFFF';
        const width = routeIds.includes(layerId.replace(/outline/, '')) ? 12 : 6;
        map.setPaintProperty(layerId, 'line-color', color);
        map.setPaintProperty(layerId, 'line-width', width);
      }

      const highlightedFeatures = geojson.features.filter(feature => routeIds.includes(feature.properties.route_id));

      if (highlightedFeatures.length === 0) {
        return;
      }

      if (zoom) {
        const zoomBounds = getBounds({
          features: highlightedFeatures
        });
        map.fitBounds(zoomBounds, {
          padding: 20
        });
      }
    }

    function unHighlightRoutes(zoom) {
      for (const layerId of routeBackgroundLayerIds) {
        map.setPaintProperty(layerId, 'line-color', '#FFFFFF');
        map.setPaintProperty(layerId, 'line-width', 6);
      }

      if (zoom) {
        map.fitBounds(bounds);
      }
    }

    // On table hover, highlight route on map
    $(() => {
      $('.overview-list a').hover(event => {
        const routeIdString = $(event.target).parents('a').data('route-ids');
        if (routeIdString) {
          const routeIds = routeIdString.toString().split(',');
          highlightRoutes(routeIds, true);
        }
      });

      $('.overview-list').hover(() => {}, () => unHighlightRoutes(true));
    });
  });

  maps[id] = map;
}
