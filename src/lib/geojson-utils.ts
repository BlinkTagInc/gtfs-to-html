import type { GtfsReader } from './gtfs-reader.js';
import simplify from '@turf/simplify';
import { omit } from 'lodash-es';
import { featureCollection, round } from '@turf/helpers';
import { logWarning } from './log-utils.js';
import { getBaseTripIds } from './trip-id-utils.js';

import type { Config, FormattedTimetable } from '../types/index.ts';

type GeoJSONFeatureCollection = GeoJSON.FeatureCollection;

/*
 * Truncate a geojson coordinates to a specific number of decimal places.
 */
const truncateGeoJSONDecimals = (
  geojson: GeoJSONFeatureCollection,
  config: Config,
) => {
  for (const feature of geojson.features) {
    if (feature.geometry.type === 'Point') {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (number: number) => round(number, config.coordinatePrecision ?? 5),
      );
    } else if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (coordinate: number[]) =>
          coordinate.map((number: number) =>
            round(number, config.coordinatePrecision ?? 5),
          ),
      );
    } else if (feature.geometry.type === 'MultiLineString') {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (linestring: number[][]) =>
          linestring.map((coordinate: number[]) =>
            coordinate.map((number: number) =>
              round(number, config.coordinatePrecision ?? 5),
            ),
          ),
      );
    }
  }

  return geojson;
};

/*
 * Get the geoJSON for a timetable.
 */
export async function getTimetableGeoJSON(
  data: GtfsReader,
  timetable: FormattedTimetable,
  config: Config,
) {
  const tripIds = getBaseTripIds(timetable.orderedTrips);

  const geojson = await buildGeoJSON(data, tripIds);

  let simplifiedGeojson;
  try {
    simplifiedGeojson = simplify(geojson, {
      tolerance: 1 / 10 ** (config.coordinatePrecision ?? 5),
      highQuality: true,
    });
  } catch {
    timetable.warnings?.push(
      `Timetable ${timetable.timetable_id} - Unable to simplify geojson`,
    );
    simplifiedGeojson = geojson;
  }

  return truncateGeoJSONDecimals(simplifiedGeojson, config);
}

/*
 * Get the geoJSON for an agency (all routes and stops).
 */
export async function getAgencyGeoJSON(data: GtfsReader, config: Config) {
  const geojson = await buildGeoJSON(data);

  let simplifiedGeojson;
  try {
    simplifiedGeojson = simplify(geojson, {
      tolerance: 1 / 10 ** (config.coordinatePrecision ?? 5),
      highQuality: true,
    });
  } catch {
    logWarning(config)('Unable to simplify geojson');
    simplifiedGeojson = geojson;
  }

  return truncateGeoJSONDecimals(simplifiedGeojson, config);
}

// Routes GeoJSON selects complete routes. Build each route's geometry
// from the actual timetable trips instead, retaining the browser's route feature
// properties and a stop-to-stop fallback for trips without usable shapes.
async function buildGeoJSON(data: GtfsReader, tripIds?: string[]) {
  const trips = await data.trips(tripIds ? { trip_id: tripIds } : {});
  const routes = await data.routes({
    route_id: [...new Set(trips.map((trip) => trip.route_id))],
  });
  const allStops = await data.gtfs.geojson.stops();
  // Source IDs scope database queries, but are not part of the map output.
  // Associated routes also omit the GTFS Plus route_attributes fields.
  const publicStopFeatures = allStops.features.map((feature) => {
    const { source_id: _source, routes, ...properties } = feature.properties;
    return {
      ...feature,
      properties: {
        ...properties,
        routes: routes.map((route) =>
          omit(route, ['source_id', 'category', 'subcategory', 'running_way']),
        ),
      },
    };
  });
  const stopFeatures = new Map(
    publicStopFeatures.map((feature) => [feature.properties.stop_id, feature]),
  );
  const usedStops = new Set<string>();
  const features: GeoJSON.Feature[] = [];
  for (const route of routes) {
    const lines: number[][][] = [];
    const seen = new Set<string>();
    for (const trip of trips.filter(
      (trip) => trip.route_id === route.route_id,
    )) {
      const stopTimes = await data.stoptimes(
        { trip_id: trip.trip_id },
        [],
        [['stop_sequence', 'ASC']],
      );
      for (const stopTime of stopTimes) {
        if (stopTime.stop_id) {
          usedStops.add(stopTime.stop_id);
        }
      }
      const shapes = trip.shape_id
        ? await data.shapes(
            { shape_id: trip.shape_id },
            [],
            [['shape_pt_sequence', 'ASC']],
          )
        : [];
      const coordinates =
        shapes.length > 1
          ? shapes.map((shape) => [shape.shape_pt_lon, shape.shape_pt_lat])
          : stopTimes.flatMap((stopTime) => {
              const feature = stopFeatures.get(stopTime.stop_id ?? '');
              return feature ? [feature.geometry.coordinates] : [];
            });
      const key = JSON.stringify(coordinates);
      if (coordinates.length > 1 && !seen.has(key)) {
        seen.add(key);
        lines.push(coordinates);
      }
    }
    if (lines.length > 0) {
      features.push({
        type: 'Feature',
        properties: {
          ...route,
          route_color: route.route_color ? `#${route.route_color}` : null,
          route_text_color: route.route_text_color
            ? `#${route.route_text_color}`
            : null,
        },
        geometry: { type: 'MultiLineString', coordinates: lines },
      });
    }
  }
  for (const feature of publicStopFeatures) {
    if (tripIds === undefined || usedStops.has(feature.properties.stop_id)) {
      features.push(feature);
    }
  }
  return featureCollection(features);
}
