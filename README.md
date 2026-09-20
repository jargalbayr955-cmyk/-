# Achilt Production V5.5

Next.js + Supabase dispatch marketplace for Achilt.

Core flow: customer selects the pickup point on the map -> nearest 8 eligible drivers are invited once -> those drivers can quote for 10 minutes -> customer selects one -> atomic lock -> live tracking/contact -> completion/payment.

Customer authentication is phone number + 4-8 digit PIN. SMS/OTP is disabled.

Maps use MapLibre GL JS with the free OpenFreeMap public vector map. No Google Maps or Mapbox API key is required.

See `PRODUCTION_SETUP.md` before deploying.
