/* global jQuery, anchorme, Pbf, stopData, routeData, routeIds, tripIds, stopIds, gtfsRealtimeUrls */
/* eslint no-var: "off", prefer-arrow-callback: "off", no-unused-vars: "off" */

let gtfsRealtimeAlertsInterval;

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

function formatAlertAsHtml(
  alert,
  affectedRouteIdsInTimetable,
  affectedStopsIdsInTimetable,
) {
  const $alert = jQuery('<div>').addClass('timetable-alert');

  const $routeList = jQuery('<div>').addClass('route-list');

  for (const routeId of affectedRouteIdsInTimetable) {
    const route = routeData[routeId];

    if (!route) {
      continue;
    }

    jQuery('<div>')
      .addClass('route-color-swatch')
      .css('background-color', route.route_color || '#000000')
      .css('color', route.route_text_color || '#FFFFFF')
      .text(route.route_short_name)
      .appendTo($routeList);
  }

  const $alertHeader = jQuery('<div>')
    .addClass('alert-header')
    .append($routeList)
    .append(
      jQuery('<div>')
        .addClass('alert-title')
        .text(alert.alert.header_text.translation[0].text),
    );

  // Use anchorme to convert URLs to clickable links while using jQuery .text to prevent XSS
  const $alertBody = jQuery('<div>')
    .addClass('alert-body')
    .append(
      anchorme(
        jQuery('<div>')
          .text(alert.alert.description_text.translation[0].text)
          .html(),
      ),
    );

  if (alert.alert.url?.translation?.[0].text) {
    jQuery('<a>')
      .attr('href', alert.alert.url.translation[0].text)
      .addClass('btn-blue btn-sm alert-more-info')
      .text('More Info')
      .appendTo($alertBody);
  }

  if (affectedStopsIdsInTimetable.length > 0) {
    const $stopList = jQuery('<ul>');

    for (const stopId of affectedStopsIdsInTimetable) {
      const stop = stopData[stopId];

      if (!stop) {
        continue;
      }

      jQuery('<li>')
        .append(jQuery('<div>').addClass('stop-name').text(stop.stop_name))
        .appendTo($stopList);
    }

    jQuery('<div>')
      .text('Stops Affected:')
      .append($stopList)
      .appendTo($alertBody);

    $stopList.prependTo($alertBody);
  }

  $alertHeader.appendTo($alert);
  $alertBody.appendTo($alert);

  return $alert;
}

async function updateAlerts() {
  if (!gtfsRealtimeUrls?.realtimeAlerts) {
    return;
  }

  try {
    const alerts = await fetchGtfsRealtime(
      gtfsRealtimeUrls.realtimeAlerts.url,
      gtfsRealtimeUrls.realtimeAlerts.headers,
    );

    if (!alerts) {
      return;
    }

    const formattedAlerts = [];

    for (const alert of alerts) {
      const affectedRouteIds = [
        ...new Set([
          ...alert.alert.informed_entity
            .filter(
              (entity) =>
                entity.route_id !== undefined && entity.route_id !== '',
            )
            .map((entity) => entity.route_id),
        ]),
      ];

      const affectedRouteIdsInTimetable = routeIds.filter((routeId) =>
        affectedRouteIds.includes(routeId),
      );

      const affectedStopIds = [
        ...new Set([
          ...alert.alert.informed_entity
            .filter(
              (entity) => entity.stop_id !== undefined && entity.stop_id !== '',
            )
            .map((entity) => entity.stop_id),
        ]),
      ];

      const affectedStopsIdsInTimetable = stopIds.filter((stopId) =>
        affectedStopIds.includes(stopId),
      );

      // Hide alerts that don't affect any stops or routes in this timetable
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
    jQuery('.timetable-alerts-list .timetable-alert').remove();

    if (formattedAlerts.length > 0) {
      // Remove the empty message if present
      jQuery('.timetable-alert-empty').hide();

      for (const alert of formattedAlerts) {
        jQuery('.timetable-alerts-list').append(alert);
      }
    } else {
      // Replace the empty message if present
      jQuery('.timetable-alert-empty').show();
    }
  } catch (error) {
    console.error(error);
  }
}

jQuery(() => {
  if (!gtfsRealtimeAlertsInterval && gtfsRealtimeUrls?.realtimeAlerts?.url) {
    const alertUpdateInterval = 60 * 1000; // Every Minute
    updateAlerts();
    gtfsRealtimeAlertsInterval = setInterval(() => {
      updateAlerts();
    }, alertUpdateInterval);
  }
});
