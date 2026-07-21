# Delivery operations workflow

**Status:** Accepted  

## Dispatcher path

1. Set Order type DELIVERY and create DeliveryJob  
2. Fill address / geocode or pin manually  
3. Plan window + optional requiredDispatchAt (windowStart − buffer)  
4. Assign OWN_COURIER or set TAXI/THIRD_PARTY reference  
5. When Order READY → Ready for dispatch / Handover  
6. Start transit → Delivered  
7. On issues → Report problem → Resolve  

## Route plan

Manual stops for a service date; reorder with version; open external navigator per stop.
