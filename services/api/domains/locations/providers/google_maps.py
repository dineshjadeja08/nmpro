"""
Google Maps Location & Places Provider
Based on Purple Squad's production-grade geocoding implementation.
"""
import hashlib
import logging
import re
import time
from typing import Any
import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

# Mock suggestions for development/testing when GOOGLE_MAPS_API_KEY is not configured
DEV_MOCK_SUGGESTIONS = [
    {
        "id": "mock_anna_nagar",
        "description": "Anna Nagar, Chennai, Tamil Nadu, India",
        "main_text": "Anna Nagar",
        "secondary_text": "Chennai, Tamil Nadu, India",
        "house_flat": "Flat 4B, Tower 2",
        "street": "2nd Avenue",
        "locality": "Anna Nagar",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "postal_code": "600040",
        "latitude": 13.0850,
        "longitude": 80.2101,
    },
    {
        "id": "mock_t_nagar",
        "description": "T. Nagar, Chennai, Tamil Nadu, India",
        "main_text": "T. Nagar",
        "secondary_text": "Chennai, Tamil Nadu, India",
        "house_flat": "Old No 12, New No 25",
        "street": "Usman Road",
        "locality": "T. Nagar",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "postal_code": "600017",
        "latitude": 13.0418,
        "longitude": 80.2341,
    },
    {
        "id": "mock_adyar",
        "description": "Adyar, Chennai, Tamil Nadu, India",
        "main_text": "Adyar",
        "secondary_text": "Chennai, Tamil Nadu, India",
        "house_flat": "Door 8",
        "street": "Lattice Bridge Road",
        "locality": "Adyar",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "postal_code": "600020",
        "latitude": 13.0012,
        "longitude": 80.2565,
    },
    {
        "id": "mock_velachery",
        "description": "Velachery, Chennai, Tamil Nadu, India",
        "main_text": "Velachery",
        "secondary_text": "Chennai, Tamil Nadu, India",
        "house_flat": "Plot 102",
        "street": "100 Feet Bypass Road",
        "locality": "Velachery",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "postal_code": "600042",
        "latitude": 12.9791,
        "longitude": 80.2212,
    },
]


class LocationProviderError(Exception):
    def __init__(self, message: str = "Address lookup is temporarily unavailable.", *, reason: str = "unavailable", status_code: Any = None):
        super().__init__(message)
        self.reason = reason
        self.status_code = status_code


class GoogleMapsLocationProvider:
    PLACES_BASE_URL = "https://places.googleapis.com/v1"
    MAPS_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

    def __init__(self, api_key: str | None = None, timeout: int | None = None):
        self.api_key = (api_key or getattr(settings, "GOOGLE_MAPS_API_KEY", "")).strip()
        self.timeout = timeout or getattr(settings, "LOCATION_PROVIDER_TIMEOUT_SECONDS", 6)

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def autocomplete(self, query: str, latitude: float | None = None, longitude: float | None = None, city: str = "") -> list[dict]:
        clean_query = query.strip()
        if not clean_query:
            return []

        # Return mock predictions if not configured
        if not self.is_configured:
            q_lower = clean_query.lower()
            matches = [
                s
                for s in DEV_MOCK_SUGGESTIONS
                if q_lower in s["description"].lower()
                or q_lower in s["main_text"].lower()
                or q_lower in s["postal_code"]
            ]
            return matches if matches else DEV_MOCK_SUGGESTIONS[:2]

        cache_key = f"location:auto:{hashlib.sha256(f'{clean_query}|{latitude}|{longitude}|{city}'.encode()).hexdigest()[:20]}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        params: dict[str, Any] = {
            "input": clean_query,
            "languageCode": "en",
            "regionCode": "in",
            "includedRegionCodes": ["in"],
        }
        if latitude is not None and longitude is not None:
            params["locationBias"] = {
                "circle": {
                    "center": {"latitude": latitude, "longitude": longitude},
                    "radius": 50000.0,
                }
            }
        elif city and city.lower() not in clean_query.lower():
            params["input"] = f"{clean_query}, {city}"

        headers = {
            "Accept": "application/json",
            "X-Goog-Api-Key": self.api_key,
        }

        try:
            resp = requests.post(
                f"{self.PLACES_BASE_URL}/places:autocomplete",
                json=params,
                headers=headers,
                timeout=self.timeout,
            )
            if resp.status_code in (401, 403):
                raise LocationProviderError("Google Maps API key is invalid or unauthorized.", reason="misconfigured", status_code=resp.status_code)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as exc:
            logger.warning("Google Maps autocomplete request failed: %s", exc)
            raise LocationProviderError("Address search failed.", reason="network_error") from exc

        suggestions = []
        for item in data.get("suggestions", [])[:8]:
            prediction = item.get("placePrediction")
            if not prediction or not prediction.get("placeId"):
                continue
            structured = prediction.get("structuredFormat") or {}
            suggestions.append({
                "id": prediction["placeId"],
                "description": (prediction.get("text") or {}).get("text", ""),
                "main_text": (structured.get("mainText") or {}).get("text", ""),
                "secondary_text": (structured.get("secondaryText") or {}).get("text", ""),
            })

        cache.set(cache_key, suggestions, timeout=getattr(settings, "LOCATION_AUTOCOMPLETE_CACHE_SECONDS", 300))
        return suggestions

    def geocode(self, place_id: str) -> dict:
        clean_id = place_id.strip()
        if not clean_id:
            raise LocationProviderError("Place ID is required.")

        # Dev mock fallback
        if not self.is_configured or clean_id.startswith("mock_"):
            selected = next((m for m in DEV_MOCK_SUGGESTIONS if m["id"] == clean_id), DEV_MOCK_SUGGESTIONS[0])
            return {
                "formatted_address": selected["description"],
                "house_flat": selected["house_flat"],
                "street": selected["street"],
                "locality": selected["locality"],
                "city": selected["city"],
                "state": selected["state"],
                "postal_code": selected["postal_code"],
                "latitude": selected["latitude"],
                "longitude": selected["longitude"],
            }

        cache_key = f"location:place:{hashlib.sha256(clean_id.encode()).hexdigest()[:20]}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        headers = {
            "Accept": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": "id,formattedAddress,addressComponents,location",
        }
        payload: dict[str, Any] = {}
        try:
            resp = requests.get(
                f"{self.PLACES_BASE_URL}/places/{clean_id}",
                headers=headers,
                timeout=self.timeout,
            )
            if resp.status_code in (401, 403):
                raise LocationProviderError("Google Maps API key is invalid or unauthorized.", reason="misconfigured", status_code=resp.status_code)
            if resp.status_code == 200:
                payload = resp.json()
            elif resp.status_code != 404:
                resp.raise_for_status()
        except requests.RequestException as exc:
            logger.warning("Google Maps Place Details request failed: %s", exc)
            raise LocationProviderError("Place details lookup failed.", reason="network_error") from exc

        location = payload.get("location") or {}
        lat = location.get("latitude")
        lng = location.get("longitude")
        components = payload.get("addressComponents", [])
        formatted_address = payload.get("formattedAddress", "")

        # Fallback to Geocoding API by place_id if Places Details returned incomplete fields
        if (lat is None or lng is None or not components) and self.api_key:
            try:
                g_resp = requests.get(
                    self.MAPS_GEOCODE_URL,
                    params={"place_id": clean_id, "key": self.api_key, "language": "en"},
                    timeout=self.timeout,
                )
                g_resp.raise_for_status()
                g_data = g_resp.json()
                g_status = g_data.get("status")
                if g_status in {"REQUEST_DENIED", "OVER_QUERY_LIMIT", "INVALID_REQUEST"}:
                    raise LocationProviderError(
                        g_data.get("error_message") or "Google Maps Geocoding rejected the request.",
                        reason="misconfigured" if g_status == "REQUEST_DENIED" else "unavailable",
                    )
                g_results = g_data.get("results") or []
                if g_results:
                    first = g_results[0]
                    components = components or first.get("address_components", [])
                    formatted_address = formatted_address or first.get("formatted_address", "")
                    geom = (first.get("geometry") or {}).get("location") or {}
                    if lat is None:
                        lat = geom.get("lat")
                    if lng is None:
                        lng = geom.get("lng")
            except requests.RequestException as exc:
                if lat is None or lng is None:
                    raise LocationProviderError("Place details lookup failed.", reason="network_error") from exc

        if lat is None and lng is None and not components:
            raise LocationProviderError("Place details not found.", reason="not_found")

        parsed = self._parse_components(components, formatted_address=formatted_address, lat=lat, lng=lng)

        # If area-level result lacked postal code or street, try reverse-geocoding coordinates
        if (not parsed.get("postal_code") or not parsed.get("city")) and lat and lng:
            try:
                fallback = self.reverse_geocode(float(lat), float(lng))
                for field in ("house_flat", "street", "locality", "city", "state", "postal_code"):
                    if not parsed.get(field) and fallback.get(field):
                        parsed[field] = fallback[field]
            except Exception:
                pass

        cache.set(cache_key, parsed, timeout=getattr(settings, "LOCATION_REVERSE_CACHE_SECONDS", 86400))
        return parsed

    def reverse_geocode(self, latitude: float, longitude: float) -> dict:
        # Dev mock fallback
        if not self.is_configured:
            mock = DEV_MOCK_SUGGESTIONS[0]
            return {
                "formatted_address": mock["description"],
                "house_flat": mock["house_flat"],
                "street": mock["street"],
                "locality": mock["locality"],
                "city": mock["city"],
                "state": mock["state"],
                "postal_code": mock["postal_code"],
                "latitude": round(float(latitude), 6),
                "longitude": round(float(longitude), 6),
            }

        cache_key = f"location:reverse:{latitude:.4f}:{longitude:.4f}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        params = {
            "latlng": f"{latitude},{longitude}",
            "key": self.api_key,
            "language": "en",
        }
        try:
            resp = requests.get(self.MAPS_GEOCODE_URL, params=params, timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as exc:
            logger.warning("Google Maps reverse geocoding request failed: %s", exc)
            raise LocationProviderError("Reverse geocoding failed.", reason="network_error") from exc

        geo_status = data.get("status")
        if geo_status in {"REQUEST_DENIED", "OVER_QUERY_LIMIT", "INVALID_REQUEST"}:
            raise LocationProviderError(
                data.get("error_message") or "Google Maps reverse geocoding rejected the request.",
                reason="misconfigured" if geo_status == "REQUEST_DENIED" else "unavailable",
            )

        results = data.get("results") or []
        if not results:
            raise LocationProviderError("No address found for these coordinates.", reason="not_found")

        first = results[0]
        components = first.get("address_components", [])
        formatted = first.get("formatted_address", "")
        geometry = first.get("geometry", {}).get("location", {})

        parsed = self._parse_components(
            components,
            formatted_address=formatted,
            lat=geometry.get("lat", latitude),
            lng=geometry.get("lng", longitude),
        )

        # Merge additional component details from secondary results if fields are missing
        for place in results[1:4]:
            for field in ("house_flat", "street", "locality", "city", "state", "postal_code"):
                if not parsed.get(field):
                    candidate = self._parse_components(place.get("address_components", []))
                    if candidate.get(field):
                        parsed[field] = candidate[field]

        cache.set(cache_key, parsed, timeout=getattr(settings, "LOCATION_REVERSE_CACHE_SECONDS", 86400))
        return parsed

    def _parse_components(self, components: list[dict], formatted_address: str = "", lat: Any = None, lng: Any = None) -> dict:
        def get_comp(*types: str) -> str:
            for item in components:
                item_types = item.get("types") or []
                if any(t in item_types for t in types):
                    return str(item.get("long_name") or item.get("longText") or item.get("short_name") or item.get("shortText") or "")
            return ""

        house_number = get_comp("premise", "subpremise", "street_number")
        route = get_comp("route", "street_address")
        locality = get_comp("sublocality_level_1", "sublocality", "neighborhood")
        city = get_comp("locality", "administrative_area_level_2", "administrative_area_level_3")
        state = get_comp("administrative_area_level_1")
        postal_code = get_comp("postal_code")

        # Fallback extract pincode from text if missing
        if not postal_code and formatted_address:
            match = re.search(r"\b([1-9]\d{5})\b", formatted_address)
            if match:
                postal_code = match.group(1)

        return {
            "formatted_address": formatted_address,
            "house_flat": house_number,
            "street": route or locality or "Main Road",
            "locality": locality or route,
            "city": city or "Chennai",
            "state": state or "Tamil Nadu",
            "postal_code": postal_code,
            "latitude": round(float(lat), 6) if lat is not None else None,
            "longitude": round(float(lng), 6) if lng is not None else None,
        }
