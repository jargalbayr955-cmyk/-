# Achilt V5.5

- Customer OTP UI removed. Customer sign-in is phone number + 4-8 digit PIN.
- Customer registration is phone number + PIN + PIN confirmation.
- OTP request/verify endpoints are disabled with HTTP 410 while this mode is active.
- Existing phone numbers cannot be silently claimed by assigning a new PIN.
- Map rendering migrated away from Mapbox/Leaflet tiles to MapLibre GL JS + OpenFreeMap public vector maps.
- OpenFreeMap public maps require no API key or billing. Attribution stays visible.
- Current-location pickup uses browser GPS and a draggable/clickable pickup marker.
- Remote pickup uses map selection instead of geocoding fallback, so a failed address lookup cannot silently use the customer's current GPS.
- Offer, driver, tracking and admin maps use the same free map stack.
