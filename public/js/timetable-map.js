/* global window, document, $, mapboxgl */
/* eslint no-var: "off", prefer-arrow-callback: "off", no-unused-vars: "off" */

var maps = {};

function formatStopPopup(feature) {
  var html = '';
  html += '<h4>' + feature.properties.stop_name + '</h4><div>';
  if (feature.properties.stop_code !== undefined) {
    html += '<label>Stop Code:</label> ' + feature.properties.stop_code + '</div>';
  }

  var routes = JSON.parse(feature.properties.routes);
  html += '<div><label>Routes Served:</label></div>';
  routes.forEach(function (route) {
    if (route.route_url) {
      html += '<div><a href="' + route.route_url + '">' + route.route_short_name + ' ' + route.route_long_name + '</a></div>';
    } else {
      html += '<div>' + route.route_short_name + ' ' + route.route_long_name + '</div>';
    }
  });
  return html;
}

function formatRoutePopup(feature) {
  var html = '';
  html += '<h4>';
  if (feature.properties.route_url) {
    html += '<a href="' + feature.properties.route_url + '">';
  }

  if (feature.properties.route_color) {
    html += '<div class="route-color-swatch" style="background-color: #' + feature.properties.route_color + '"></div>';
  }

  html += feature.properties.route_short_name + ' ' + feature.properties.route_long_name;

  if (feature.properties.route_url) {
    html += '</a>';
  }

  html += '</h4>';
  return html;
}

function getBounds(geojson) {
  var bounds = new mapboxgl.LngLatBounds();
  geojson.features.forEach(function (feature) {
    if (feature.geometry.type === 'Point') {
      bounds.extend(feature.geometry.coordinates);
    } else if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates.forEach(function (coordinate) {
        bounds.extend(coordinate);
      });
    }
  });
  return bounds;
}

function createMap(id, geojson, routeColor) {
  var defaultRouteColor = 'FF4728';

  if (!geojson || geojson.features.length === 0) {
    $('#map_' + id).hide();
    return false;
  }

  if (!routeColor) {
    routeColor = defaultRouteColor;
  }

  var bounds = getBounds(geojson);
  var map = new mapboxgl.Map({
    container: 'map_' + id,
    style: 'mapbox://styles/mapbox/light-v9',
    center: bounds.getCenter(),
    zoom: 12
  });

  map.scrollZoom.disable();
  map.addControl(new mapboxgl.NavigationControl());

  function createMarker() {
    var el = document.createElement('div');
    el.className = 'marker';
    return el;
  }

  map.on('load', function () {
    map.fitBounds(bounds, {
      padding: 20
    });

    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: {
        type: 'geojson',
        data: geojson
      },
      paint: {
        'line-color': '#' + routeColor,
        'line-opacity': 0.7,
        'line-width': {
          stops: [[9, 3], [13, 6]]
        }
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      filter: ['!has', 'stop_id']
    });

    map.addLayer({
      id: 'stops',
      type: 'circle',
      source: {
        type: 'geojson',
        data: geojson
      },
      paint: {
        'circle-radius': {
          stops: [[9, 3], [13, 6], [15, 8]]
        },
        'circle-stroke-width': 1,
        'circle-stroke-color': '#363636',
        'circle-color': '#' + routeColor
      },
      filter: ['has', 'stop_id']
    });

    map.addLayer({
      id: 'stops-highlighted',
      type: 'circle',
      source: {
        type: 'geojson',
        data: geojson
      },
      paint: {
        'circle-radius': {
          stops: [[9, 6], [13, 9], [15, 10]]
        },
        'circle-stroke-width': 2,
        'circle-stroke-color': '#111111',
        'circle-color': '#' + routeColor
      },
      filter: ['==', 'stop_id', '']
    });

    map.on('mouseenter', 'stops', function () {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'stops', function () {
      map.getCanvas().style.cursor = '';
    });

    map.on('click', function (e) {
      // Set bbox as 5px reactangle area around clicked point
      var bbox = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]];
      var features = map.queryRenderedFeatures(bbox, {layers: ['stops']});

      if (!features || features.length === 0) {
        return;
      }

      // Get the first feature and show popup
      var feature = features[0];

      new mapboxgl.Popup()
        .setLngLat(feature.geometry.coordinates)
        .setHTML(formatStopPopup(feature))
        .addTo(map);
    });

    function highlightStop(stopId) {
      map.setFilter('stops-highlighted', ['==', 'stop_id', stopId]);
      map.setPaintProperty('stops', 'circle-opacity', 0.5);
    }

    function unHighlightStop() {
      map.setFilter('stops-highlighted', ['==', 'stop_id', '']);
      map.setPaintProperty('stops', 'circle-opacity', 1);
    }

    // On table hover, highlight stop on map
    $('th, td', $('#' + id + ' table')).hover(function () {
      var stopId;
      var table = $(this).parents('table');
      if (table.data('orientation') === 'vertical') {
        var index = $(this).index();
        stopId = $('colgroup col', table).eq(index).data('stop-id');
      } else {
        stopId = $(this).parents('tr').data('stop-id');
      }

      if (stopId === undefined) {
        return;
      }

      highlightStop(stopId.toString());
    }, unHighlightStop);
  });

  maps[id] = map;
}

function createSystemMap(id, geojson) {
  var defaultRouteColor = 'FF4728';
  var routeLayerIds = [];

  if (!geojson || geojson.features.length === 0) {
    $('#' + id).hide();
    return false;
  }

  var headerHeight = 65;
  $('#' + id).height($(window).height() - headerHeight);
  $('.overview-list').height($(window).height() - headerHeight);

  var bounds = getBounds(geojson);
  var map = new mapboxgl.Map({
    container: id,
    style: 'mapbox://styles/mapbox/light-v9',
    center: bounds.getCenter(),
    zoom: 12
  });
  var routes = geojson.features.reduce(function (memo, feature) {
    memo[feature.properties.route_id] = feature.properties;
    return memo;
  }, {});

  map.scrollZoom.disable();
  map.addControl(new mapboxgl.NavigationControl());

  map.on('load', function () {
    map.fitBounds(bounds, {
      padding: 20
    });

    Object.keys(routes).forEach(function (routeId) {
      routeLayerIds.push(routeId);
      var routeColor = routes[routeId].route_color || defaultRouteColor;
      map.addLayer({
        id: routeId,
        type: 'line',
        source: {
          type: 'geojson',
          data: geojson
        },
        paint: {
          'line-color': '#' + routeColor,
          'line-opacity': 0.7,
          'line-width': {
            stops: [[9, 3], [13, 6]]
          }
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        filter: ['==', 'route_id', routeId]
      });

      map.on('mouseenter', routeId, function () {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', routeId, function () {
        map.getCanvas().style.cursor = '';
      });
    });

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

    map.on('click', function (e) {
      // Set bbox as 5px reactangle area around clicked point
      var bbox = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]];
      var features = map.queryRenderedFeatures(bbox, {layers: routeLayerIds});

      if (!features || features.length === 0) {
        return;
      }

      // Get the first feature and show popup
      var feature = features[0];

      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(formatRoutePopup(feature))
        .addTo(map);
    });

    function highlightRoutes(routeIds) {
      routeLayerIds.forEach(function (layerId) {
        var lineOpacity = (routeIds.indexOf(layerId) === -1) ? 0.1 : 1;
        map.setPaintProperty(layerId, 'line-opacity', lineOpacity);
      });

      map.setFilter('routes-label', ['in', 'route_id'].concat(routeIds));

      var highlightedFeatures = geojson.features.reduce(function (memo, feature) {
        if (routeIds.indexOf(feature.properties.route_id) !== -1) {
          memo.push(feature);
        }

        return memo;
      }, []);
      var zoomBounds = getBounds({features: highlightedFeatures});
      map.fitBounds(zoomBounds, {padding: 20});
    }

    function unHighlightRoutes() {
      routeLayerIds.forEach(function (layerId) {
        map.setPaintProperty(layerId, 'line-opacity', 0.7);
      });
      map.setFilter('routes-label', ['==', 'route_id', '']);
      map.fitBounds(bounds);
    }

    // On table hover, highlight route on map
    $(function () {
      $('.list-group-item').hover(function () {
        var routeIds = $(this).data('route-ids').toString().split(',');
        highlightRoutes(routeIds);
      }, unHighlightRoutes);
    });
  });

  maps[id] = map;
}
