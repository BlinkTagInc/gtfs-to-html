/* global anchorme, Pbf, FeedMessage, stopData, routeData, routeIds, tripIds, stopIds, gtfsRealtimeUrls */
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
  const alertElement = document.createElement('div');
  alertElement.classList.add('timetable-alert');

  const routeList = document.createElement('div');
  routeList.classList.add('route-list');

  for (const routeId of affectedRouteIdsInTimetable) {
    const route = routeData[routeId];

    if (!route) {
      continue;
    }

    const routeSwatch = document.createElement('div');
    routeSwatch.classList.add('route-color-swatch');
    routeSwatch.style.backgroundColor = route.route_color || '#000000';
    routeSwatch.style.color = route.route_text_color || '#FFFFFF';
    routeSwatch.textContent = route.route_short_name;
    routeList.appendChild(routeSwatch);
  }

  const alertHeader = document.createElement('div');
  alertHeader.classList.add('alert-header');
  alertHeader.appendChild(routeList);

  const alertTitle = document.createElement('div');
  alertTitle.classList.add('alert-title');
  alertTitle.textContent = alert.alert.header_text.translation[0].text;
  alertHeader.appendChild(alertTitle);

  // Use anchorme to convert URLs to clickable links while using textContent to prevent XSS
  const alertBody = document.createElement('div');
  alertBody.classList.add('alert-body');

  const tempDiv = document.createElement('div');
  tempDiv.textContent = alert.alert.description_text.translation[0].text;
  alertBody.innerHTML = anchorme(tempDiv.innerHTML);

  if (alert.alert.url?.translation?.[0].text) {
    const moreInfoLink = document.createElement('a');
    moreInfoLink.href = alert.alert.url.translation[0].text;
    moreInfoLink.classList.add('btn-active', 'btn-sm', 'alert-more-info');
    moreInfoLink.textContent = 'More Info';
    alertBody.appendChild(moreInfoLink);
  }

  if (affectedStopsIdsInTimetable.length > 0) {
    const stopList = document.createElement('ul');

    for (const stopId of affectedStopsIdsInTimetable) {
      const stop = stopData[stopId];

      if (!stop) {
        continue;
      }

      const listItem = document.createElement('li');
      const stopName = document.createElement('div');
      stopName.classList.add('stop-name');
      stopName.textContent = stop.stop_name;
      listItem.appendChild(stopName);
      stopList.appendChild(listItem);
    }

    const stopsAffectedText = document.createElement('div');
    stopsAffectedText.classList.add('alert-label');
    stopsAffectedText.textContent = 'Stops Affected:';

    alertBody.appendChild(stopsAffectedText);
    alertBody.appendChild(stopList);
  }

  alertElement.appendChild(alertHeader);
  alertElement.appendChild(alertBody);

  return alertElement;
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
    const existingAlerts = document.querySelectorAll(
      '.timetable-alerts-list .timetable-alert',
    );
    existingAlerts.forEach((alert) => alert.remove());

    if (formattedAlerts.length > 0) {
      // Remove the empty message if present
      const emptyMessage = document.querySelector('.timetable-alert-empty');
      if (emptyMessage) {
        emptyMessage.style.display = 'none';
      }

      const alertsList = document.querySelector('.timetable-alerts-list');
      for (const alert of formattedAlerts) {
        alertsList.appendChild(alert);
      }
    } else {
      // Replace the empty message if present
      const emptyMessage = document.querySelector('.timetable-alert-empty');
      if (emptyMessage) {
        emptyMessage.style.display = 'block';
      }
    }
  } catch (error) {
    console.error(error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAlerts);
} else {
  initializeAlerts();
}

function initializeAlerts() {
  if (!gtfsRealtimeAlertsInterval && gtfsRealtimeUrls?.realtimeAlerts?.url) {
    const alertUpdateInterval = 60 * 1000; // Every Minute
    updateAlerts();
    gtfsRealtimeAlertsInterval = setInterval(() => {
      updateAlerts();
    }, alertUpdateInterval);
  }
}
