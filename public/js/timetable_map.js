function getStopInfoText(stop) {
  return '<h3>' + stop.stop_name + '</h3>';
}

function createMap(id, stops, shapes) {
  var bounds = new mapboxgl.LngLatBounds();
  var map = new mapboxgl.Map({
    container: 'map_' + id,
    style: 'mapbox://styles/mapbox/streets-v9',
    center: [stops[0].stop_lon, stops[0].stop_lat],
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
    stops.forEach(function(stop) {
      var coord = [stop.stop_lon, stop.stop_lat];

      var popup = new mapboxgl.Popup({offset: 15}).setHTML(getStopInfoText(stop));
      var marker = new mapboxgl.Marker(createMarker(), {offset: [-7, -7]})
        .setLngLat(coord)
        .setPopup(popup)
        .addTo(map);

      bounds.extend(coord);
    });

    map.fitBounds(bounds, {
      padding: 20
    });

    if (!shapes || !shapes.length) {
      shapes = [stops.map(function(stop) {
        return [stop.stop_lon, stop.stop_lat];
      })];
    }

    map.addLayer({
      id: 'shape',
      type: 'line',
      source: {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'MultiLineString',
            coordinates: shapes
          }
        }
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#4171ff',
        'line-width': 4
      }
    });
  });
}
