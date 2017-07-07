function formatPopup(feature) {
  var html = '';
  html += '<h4>' + feature.properties.stop_name  + '</h4><div>'
  if (feature.properties.stop_code !== undefined) {
    html += '<label>Stop Code:</label> ' + feature.properties.stop_code + '</div>';
  }

  var routes = JSON.parse(feature.properties.routes);
  html += '<div><label>Routes Served:</label></div>';
  routes.forEach(function(route) {
    if (route.route_url) {
      html += '<div><a href="' + route.route_url + '">' + route.route_short_name + ' ' + route.route_long_name + '</a></div>';
    } else {
      html += '<div>' + route.route_short_name + ' ' + route.route_long_name + '</div>';
    }
  });
  return html;
}

function createMap(id, geojson, routeColor) {
  var bounds = new mapboxgl.LngLatBounds();

  geojson.features.forEach(function(feature) {
    if (feature.geometry.type === 'Point') {
      bounds.extend(feature.geometry.coordinates);
    } else if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates.forEach(function(coordinate) {
        bounds.extend(coordinate);
      });
    }
  });

  var map = new mapboxgl.Map({
    container: 'map_' + id,
    style: 'mapbox://styles/mapbox/streets-v9',
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
        'line-color': routeColor ? '#' + routeColor : 'rgb(255, 71, 40)',
        'line-width': 6
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      }
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
        'circle-color': routeColor ? '#' + routeColor : 'rgb(255, 71, 40)'
      },
      filter: ['has', 'stop_id']
    });

    map.on('mouseenter', 'stops', function() {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'stops', function() {
      map.getCanvas().style.cursor = '';
    });

    map.on('click', function(e) {
      // set bbox as 5px reactangle area around clicked point
      var bbox = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]];
      var features = map.queryRenderedFeatures(bbox, { layers: ['stops'] });

      if (!features || !features.length) {
        return;
      }

      // Get the first feature and show popup
      feature = features[0]

      new mapboxgl.Popup()
        .setLngLat(feature.geometry.coordinates)
        .setHTML(formatPopup(feature))
        .addTo(map);
    });
  });
}
