/* global anchorme, Pbf, FeedMessage, EntitySelector, TripDescriptor, TimeRange, alertPatterns, stopData, routeData, routeIds, stopIds, gtfsRealtimeUrls */

let gtfsRealtimeAlertsInterval;
let alertWindowTimer;
const alertCards = new Map();
let alertRefreshPending = false;
let alertRefreshWarning = '';
let lastAlertRefresh;

// Preserve optional selector fields. The packaged decoder otherwise supplies
// route_type 0 (tram) even when absent and skips direction_id entirely.
EntitySelector.read = function (pbf, end) {
  return pbf.readFields(
    (tag, entity, reader) => {
      if (tag === 4) {
        entity.trip = reader.readFields(
          TripDescriptor._readField,
          {},
          reader.readVarint() + reader.pos,
        );
      } else if (tag === 6) {
        entity.direction_id = reader.readVarint();
      } else {
        EntitySelector._readField(tag, entity, reader);
      }
    },
    {},
    end,
  );
};

// An omitted end is open-ended. An explicit zero is the Unix epoch.
TimeRange.read = function (pbf, end) {
  return pbf.readFields(TimeRange._readField, {}, end);
};

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
  if (bufferRes.byteLength === 0) {
    throw new Error('Empty realtime feed response');
  }
  const pbf = new Pbf.PbfReader(new Uint8Array(bufferRes));
  const obj = FeedMessage.read(pbf);
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
  const alertBodyDiv = document.createElement('div');
  alertBodyDiv.innerHTML = anchorme(tempDiv.innerHTML);
  alertBody.appendChild(alertBodyDiv);

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

function matchesAlertSelector(entity, pattern) {
  const route = routeData[pattern.routeId];
  const trip = entity.trip;
  // A route from an unresolved trip descriptor cannot identify the affected trip.
  if (trip && !trip.trip_id) {
    return false;
  }
  if (
    !entity.agency_id &&
    !entity.route_id &&
    entity.route_type === undefined &&
    !entity.stop_id &&
    !trip &&
    entity.direction_id === undefined
  ) {
    return false;
  }
  return (
    (!entity.agency_id || entity.agency_id === route?.agency_id) &&
    (!entity.route_id || entity.route_id === pattern.routeId) &&
    (entity.route_type === undefined ||
      entity.route_type === route?.route_type) &&
    (entity.direction_id === undefined ||
      entity.direction_id === pattern.directionId) &&
    (!entity.stop_id || pattern.stopIds.includes(entity.stop_id)) &&
    (!trip?.trip_id || pattern.tripIds.includes(trip.trip_id)) &&
    (!trip?.route_id || trip.route_id === pattern.routeId) &&
    (trip?.direction_id === undefined ||
      trip.direction_id === pattern.directionId)
  );
}

function renderAlerts(alerts) {
  clearTimeout(alertWindowTimer);
  const now = Date.now() / 1000;
  let nextBoundary = Infinity;
  const alertsList = document.querySelector('.timetable-alerts-list');
  const visibleKeys = new Set();

  for (const alert of alerts) {
    const entities = alert.alert?.informed_entity ?? [];
    const matchedRoutes = new Set();
    const matchedStops = new Set();

    for (const entity of entities) {
      for (const pattern of alertPatterns) {
        if (!matchesAlertSelector(entity, pattern)) {
          continue;
        }
        if (entity.stop_id) {
          matchedStops.add(entity.stop_id);
        }
        if (
          !entity.stop_id ||
          entity.route_id ||
          entity.trip ||
          entity.route_type !== undefined ||
          entity.agency_id ||
          entity.direction_id !== undefined
        ) {
          matchedRoutes.add(pattern.routeId);
        }
      }
    }

    const affectedRouteIdsInTimetable = routeIds.filter((id) =>
      matchedRoutes.has(id),
    );
    const affectedStopsIdsInTimetable = stopIds.filter((id) =>
      matchedStops.has(id),
    );

    // Hide alerts that don't affect any stops or routes in this timetable
    if (
      affectedStopsIdsInTimetable.length === 0 &&
      affectedRouteIdsInTimetable.length === 0
    ) {
      continue;
    }

    const periods = alert.alert.active_period ?? [];
    for (const { start, end } of periods) {
      if (start > now) {
        nextBoundary = Math.min(nextBoundary, start);
      }
      if (end > now) {
        nextBoundary = Math.min(nextBoundary, end);
      }
    }

    if (
      periods.length > 0 &&
      !periods.some(
        ({ start, end }) =>
          (start !== undefined || end !== undefined) &&
          (start === undefined || start <= now) &&
          (end === undefined || now < end),
      )
    ) {
      continue;
    }

    try {
      const key = alert.id;
      const signature = JSON.stringify([
        alert.alert.header_text?.translation?.[0]?.text,
        alert.alert.description_text?.translation?.[0]?.text,
        alert.alert.url?.translation?.[0]?.text,
        affectedRouteIdsInTimetable,
        affectedStopsIdsInTimetable,
      ]);
      const existing = alertCards.get(key);
      if (existing?.signature !== signature) {
        const element = formatAlertAsHtml(
          alert,
          affectedRouteIdsInTimetable,
          affectedStopsIdsInTimetable,
        );
        if (existing) {
          existing.element.replaceWith(element);
        } else {
          alertsList.appendChild(element);
        }
        alertCards.set(key, { signature, element });
      }
      visibleKeys.add(key);
    } catch (error) {
      console.error(error);
    }
  }

  for (const [key, card] of alertCards) {
    if (!visibleKeys.has(key)) {
      card.element.remove();
      alertCards.delete(key);
    }
  }
  setAlertStatus(
    alertRefreshWarning ||
      (visibleKeys.size ? '' : 'There are no service alerts at this time.'),
  );

  // Re-evaluate the last feed at the boundary, even between downloads.
  if (Number.isFinite(nextBoundary)) {
    const delay = Math.min(nextBoundary * 1000 - Date.now(), 2 ** 31 - 1);
    alertWindowTimer = setTimeout(() => renderAlerts(alerts), delay);
  }
}

function setAlertStatus(message) {
  const status = document.querySelector('.timetable-alert-empty');
  if (status) {
    if (status.textContent !== message) {
      status.textContent = message;
    }
    status.style.display = message ? 'block' : 'none';
  }
}

async function updateAlerts() {
  if (!gtfsRealtimeUrls?.realtimeAlerts?.url || alertRefreshPending) {
    return;
  }

  alertRefreshPending = true;
  try {
    const alerts = await fetchGtfsRealtime(
      gtfsRealtimeUrls.realtimeAlerts.url,
      gtfsRealtimeUrls.realtimeAlerts.headers,
    );
    alertRefreshWarning = '';
    renderAlerts(alerts);
    lastAlertRefresh = new Date();
  } catch (error) {
    console.error(error);
    alertRefreshWarning = 'Service alerts are temporarily unavailable.';
    if (lastAlertRefresh) {
      alertRefreshWarning +=
        ' Last checked: ' + lastAlertRefresh.toLocaleString() + '.';
    }
    setAlertStatus(alertRefreshWarning);
  } finally {
    alertRefreshPending = false;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAlerts);
} else {
  initializeAlerts();
}

function initializeAlerts() {
  if (
    typeof gtfsRealtimeUrls === 'undefined' ||
    !gtfsRealtimeUrls?.realtimeAlerts?.url
  ) {
    setAlertStatus('Service alerts are temporarily unavailable.');
    return;
  }
  if (!gtfsRealtimeAlertsInterval) {
    const alertUpdateInterval = 60 * 1000; // Every Minute
    updateAlerts();
    gtfsRealtimeAlertsInterval = setInterval(() => {
      updateAlerts();
    }, alertUpdateInterval);
  }
}
