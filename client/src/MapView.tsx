import { useEffect, useRef } from 'react'
import {
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  type GeoJSONSource,
  type StyleSpecification,
} from 'maplibre-gl'
import type { FeatureCollection, Geometry } from 'geojson'

type MapFeature = FeatureCollection<Geometry, Record<string, string | number | null>>

type MapViewProps = {
  data: MapFeature
  fitKey: number
}

const emptyData: MapFeature = {
  type: 'FeatureCollection',
  features: [],
}

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'openstreetmap',
      type: 'raster',
      source: 'osm',
    },
  ],
}

function extendCoordinates(
  bounds: LngLatBounds,
  coordinates: unknown,
) {
  if (!Array.isArray(coordinates)) return
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    bounds.extend([coordinates[0], coordinates[1]])
    return
  }
  coordinates.forEach((value) => extendCoordinates(bounds, value))
}

function fitData(map: MapLibreMap, data: MapFeature) {
  const bounds = new LngLatBounds()
  for (const item of data.features) {
    const geometry = item.geometry
    if (geometry.type === 'GeometryCollection') {
      geometry.geometries.forEach((child) =>
        extendCoordinates(bounds, 'coordinates' in child ? child.coordinates : []),
      )
    } else {
      extendCoordinates(bounds, geometry.coordinates)
    }
  }
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 500 })
  }
}

export function MapView({ data, fitKey }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const latestDataRef = useRef(data)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyle,
      center: [28.9784, 41.0082],
      zoom: 11,
    })
    mapRef.current = map
    map.addControl(new NavigationControl(), 'top-right')
    map.on('load', () => {
      map.addSource('trace-data', {
        type: 'geojson',
        data: latestDataRef.current,
      })
      map.addLayer({
        id: 'trace-lines',
        type: 'line',
        source: 'trace-data',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': '#2563eb',
          'line-width': 4,
          'line-opacity': 0.8,
        },
      })
      map.addLayer({
        id: 'trace-points',
        type: 'circle',
        source: 'trace-data',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': [
            'match',
            ['get', 'kind'],
            'current',
            '#dc2626',
            'dwell',
            '#f59e0b',
            '#2563eb',
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })
      map.on('click', 'trace-points', (event) => {
        const properties = event.features?.[0]?.properties
        const name = properties?.user
        const kind = properties?.kind
        const label =
          typeof name === 'string'
            ? name
            : kind === 'current'
              ? 'Playback position'
              : kind === 'dwell'
                ? `${properties?.duration ?? 'Candidate'} min stop`
                : 'Location'
        const content = document.createElement('div')
        content.textContent = label
        new Popup().setLngLat(event.lngLat).setDOMContent(content).addTo(map)
      })
      map.on('mouseenter', 'trace-points', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'trace-points', () => {
        map.getCanvas().style.cursor = ''
      })
      fitData(map, latestDataRef.current)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    latestDataRef.current = data
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('trace-data') as GeoJSONSource | undefined
    source?.setData(data ?? emptyData)
  }, [data])

  useEffect(() => {
    const map = mapRef.current
    if (map?.getSource('trace-data')) fitData(map, latestDataRef.current)
  }, [fitKey])

  return <div className="absolute inset-0" ref={containerRef} aria-label="Location map" />
}
