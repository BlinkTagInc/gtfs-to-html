/* global window, document, $, anchorme, mapboxgl, Pbf, stopData, routeData, routeIds, tripIds, stopIds, gtfsRealtimeUrls */
/* eslint no-var: "off", prefer-arrow-callback: "off", no-unused-vars: "off" */

let gtfsRealtimeAlertsInterval;

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

function formatAlertAsHtml(
  alert,
  affectedRouteIdsInTimetable,
  affectedStopsIdsInTimetable,
) {
  const $alert = $('<div>').addClass('timetable-alert');

  const $routeList = $('<div>').addClass('route-list');

  for (const routeId of affectedRouteIdsInTimetable) {
    const route = routeData[routeId];

    if (!route) {
      continue;
    }

    $('<div>')
      .addClass('route-color-swatch')
      .css('background-color', route.route_color || '#000000')
      .css('color', route.route_text_color || '#FFFFFF')
      .text(route.route_short_name)
      .appendTo($routeList);
  }

  const $alertHeader = $('<div>')
    .addClass('alert-header')
    .append($routeList)
    .append(
      $('<div>')
        .addClass('alert-title')
        .text(alert.alert.header_text.translation[0].text),
    );

  // Use anchorme to convert URLs to clickable links while using jQuery .text to prevent XSS
  const $alertBody = $('<div>')
    .addClass('alert-body')
    .append(
      anchorme(
        $('<div>')
          .text(alert.alert.description_text.translation[0].text)
          .html(),
      ),
    );

  if (alert.alert.url?.translation?.[0].text) {
    $('<a>')
      .attr('href', alert.alert.url.translation[0].text)
      .addClass('btn-blue btn-sm alert-more-info')
      .text('More Info')
      .appendTo($alertBody);
  }

  if (affectedStopsIdsInTimetable.length > 0) {
    const $stopList = $('<ul>');

    for (const stopId of affectedStopsIdsInTimetable) {
      const stop = stopData[stopId];

      if (!stop) {
        continue;
      }

      $('<li>')
        .append($('<div>').addClass('stop-name').text(stop.stop_name))
        .appendTo($stopList);
    }

    $('<div>').text('Stops Affected:').append($stopList).appendTo($alertBody);

    $stopList.prependTo($alertBody);
  }

  $alertHeader.appendTo($alert);
  $alertBody.appendTo($alert);

  return $alert;
}

jQuery(function ($) {
  async function updateAlerts() {
    const realtimeAlerts = gtfsRealtimeUrls?.realtimeAlerts;

    if (!realtimeAlerts) {
      return;
    }

    try {
      const alerts = await fetchGtfsRealtime(
        realtimeAlerts.url,
        realtimeAlerts.headers,
      );

      const formattedAlerts = [];

      for (const alert of alerts) {
        const affectedRouteIds = alert.alert.informed_entity
          .filter(
            (entity) => entity.route_id !== undefined && entity.route_id !== '',
          )
          .map((entity) => entity.route_id);
        const affectedRouteIdsInTimetable = routeIds.filter((routeId) =>
          affectedRouteIds.includes(routeId),
        );

        const affectedStopIds = [
          ...new Set([
            alert.alert.informed_entity
              .filter(
                (entity) =>
                  entity.stop_id !== undefined && entity.stop_id !== '',
              )
              .map((entity) => entity.stop_id),
          ]),
        ];

        const affectedStopsIdsInTimetable = stopIds.filter((stopId) =>
          affectedStopIds.includes(stopId),
        );

        // Hide alerts that don't affect any stops or routes
        if (
          affectedStopsIdsInTimetable.length === 0 &&
          affectedRouteIdsInTimetable.length === 0
        ) {
          continue;
        }

        try {
          formattedAlerts.push(
            formatAlertAsHtml(
              alert,
              affectedRouteIdsInTimetable,
              affectedStopsIdsInTimetable,
            ),
          );
        } catch (error) {
          console.error(error);
        }
      }

      // Remove previously posted GTFS-RT alerts
      $('.timetable-alerts-list .timetable-alert').remove();

      if (formattedAlerts.length > 0) {
        // Remove the empty message if present
        $('.timetable-alert-empty').hide();

        for (const alert of formattedAlerts) {
          $('.timetable-alerts-list').append(alert);
        }
      } else {
        // Replace the empty message if present
        $('.timetable-alert-empty').show();
      }
    } catch (error) {
      console.error(error);
    }
  }

  if (!gtfsRealtimeAlertsInterval && gtfsRealtimeUrls?.realtimeAlerts?.url) {
    const alertUpdateInterval = 60 * 1000; // Every Minute
    updateAlerts();
    gtfsRealtimeAlertsInterval = setInterval(() => {
      updateAlerts();
    }, alertUpdateInterval);
  }
});