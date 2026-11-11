import datetime
from django.core.management.base import BaseCommand
from django.utils import timezone

from domains.catalog.models import Category, Service, ServicePackage, PricingRule
from domains.locations.models import City, Zone, ServiceCoverage
from domains.bookings.models import AppointmentSlot


RAW_CATALOGUE = [
    # ----------------------------------------------------
    # 1. Water Purifier
    # ----------------------------------------------------
    {
        "category_slug": "water-purifier",
        "category_name": "Water Purifier",
        "category_desc": "Water purifier installation, maintenance, and filter services.",
        "services": [
            {
                "slug": "water-purifier-repair-services",
                "name": "Water Purifier Repair & Services",
                "is_active": True,
                "current_price": 199.00,
                "base_price": 350.00,
                "duration": 60,
                "short_description": "RO/UV purifier service for leakage, low flow, taste, and filter issues.",
                "full_description": "Repair and maintenance visit for water purifiers with slow water flow, leakage, bad taste, filter alerts, or power issues.",
                "inclusions": ["Technician visit", "Issue diagnosis", "Basic external inspection", "Service estimate before extra work"],
                "exclusions": ["Filters, membrane, pump, UV lamp, or other parts", "Plumbing changes", "Water quality lab testing"],
                "notes": "Filter or membrane replacement is quoted separately after inspection.",
                "advance_paise": 4900,
                "pricing_model": "INSPECTION_BASED",
            },
        ],
    },
    # ----------------------------------------------------
    # 2. AC
    # ----------------------------------------------------
    {
        "category_slug": "ac",
        "category_name": "AC",
        "category_desc": "AC repair, cleaning, installation, uninstallation and gas services.",
        "services": [
            {
                "slug": "ac-service",
                "name": "AC Inspection Charge",
                "is_active": True,
                "current_price": 249.00,
                "base_price": 350.00,
                "duration": 30,
                "short_description": "We will inspect your AC and identify any cooling, airflow, power, leakage, or noise issues.",
                "full_description": "Quick AC Check – We check your AC and find the exact problem.\nClear Price – We tell you the repair cost before starting the work.\nYour Approval First – We start the repair only after you approve the cost.",
                "inclusions": [
                    "Our technician will check your AC, including gas level and other issues.",
                    "We will explain the problem and share the repair cost before starting the work.",
                    "After the service, we will check the gas level, cooling, and overall AC performance.",
                    "If you take the service, the inspection charge will be adjusted in your final bill.",
                ],
                "exclusions": [
                    "Spare parts and AC gas charges are extra, as per our price list.",
                    "Please arrange a ladder or bucket if needed for the service.",
                    "Warranty is available only if the recommended service is completed",
                ],
                "notes": "Inspection Fee: The ₹299 inspection fee will be discounted from your total bill if you get the repair done with us. Spare Parts Warranty: Our warranty only covers parts supplied by us, not spare parts provided by the customer.",
                "advance_paise": 4900,
                "pricing_model": "INSPECTION_BASED",
            },
            {
                "slug": "foam-jet-ac-service",
                "name": "Foam Jet AC Service",
                "is_active": True,
                "current_price": 849.00,
                "base_price": 1200.00,
                "duration": 60,
                "short_description": "Foam jet cleaning service for AC filters, coil surface, and accessible parts.",
                "full_description": "Foam jet AC service for better airflow and routine hygiene cleaning of accessible indoor unit parts.",
                "inclusions": ["Filter cleaning", "Foam jet cleaning of accessible coil surface", "Drainage check", "Cooling test"],
                "exclusions": ["Gas refill", "Spare parts", "Outdoor unit deep wash", "Major repair"],
                "notes": "Power and safe access are required during service.",
                "advance_paise": 4900,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "ac-chemical-wash",
                "name": "AC Chemical Wash",
                "is_active": True,
                "current_price": 2049.00,
                "base_price": 3000.00,
                "duration": 120,
                "short_description": "Deep AC chemical wash for indoor unit cleaning and better cooling performance.",
                "full_description": "1. AC Inspection: Our technician checks the AC and cooling condition.\n2. Protect Your Home: We cover the area to keep your wall and floor clean.\n3. Chemical Cleaning: We use a suitable cleaning solution to remove dust, dirt, and buildup from the AC.\n4. Deep Wash: The AC coil, blower, drain tray, and other parts are thoroughly cleaned.\n5. Final Check: We test cooling, airflow, drainage, and overall AC performance.",
                "inclusions": ["AC inspection before clean", "Indoor unit chemical cleaning", "AC coil and blower cleaning", "Drain tray and drain pipe cleaning", "Dust and dirt removal", "Final cooling and airflow check"],
                "exclusions": ["AC gas filling or gas top-up charges", "Spare parts and replacement charges", "AC repair or electrical work", "Copper pipe or gas leakage repair", "AC installation, uninstallation, or shifting", "Major parts repair or replacement, such as PCB, compressor, or fan motor"],
                "notes": "Technician will confirm if chemical wash is suitable after inspection. Our warranty only covers parts provided by us, not parts you buy yourself.",
                "advance_paise": 4900,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "general-ac-service",
                "name": "General AC Service",
                "is_active": True,
                "current_price": 650.00,
                "base_price": 800.00,
                "duration": 60,
                "short_description": "Routine AC cleaning and performance checks for filters, coils, drainage, and an accessible outdoor unit.",
                "full_description": "1. Basic Check: We check the AC cooling and airflow.\n2. Indoor Unit Cleaning: We clean the AC filters, coils, and water drainage area.\n3. Outdoor Unit Cleaning: We clean the outside unit if it is easy to access.\n4. Final Check & Cleanup: We check the AC is working properly and clean the work area.",
                "inclusions": ["Suitable for both split ACs", "Cleaning the outside surface of the outdoor unit, if accessible."],
                "exclusions": ["AC gas refill or gas leak repair is not included.", "Deep cleaning or foam cleaning is not included.", "Replacement of major AC parts is not included.", "Electrical repair work is not included."],
                "notes": "Technician confirms extra materials before work starts.",
                "advance_paise": 4900,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "ac-uninstallation-installation",
                "name": "AC Uninstallation & Installation",
                "is_active": True,
                "current_price": 2449.00,
                "base_price": 3000.00,
                "duration": 240,
                "short_description": "Combo package for removing an existing AC and installing it at another location.",
                "full_description": "AC shifting combo for uninstallation and installation with basic fitting and performance check.",
                "inclusions": ["AC uninstallation", "AC installation", "Drainage setup", "Basic cooling test"],
                "exclusions": ["Transport", "Extra copper pipe, wire, stand, bracket, core cutting, or civil work"],
                "notes": "Material and transport charges are confirmed separately.",
                "advance_paise": 4900,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "ac-repair-gas-refill",
                "name": "AC Gas Refill",
                "is_active": True,
                "current_price": 2799.00,
                "base_price": 3000.00,
                "duration": 46,
                "short_description": "AC repair visit with gas refill package after leakage and cooling diagnosis.",
                "full_description": "1. Check for Gas Leakage: Our technician checks the AC for gas leaks. Inspection charges apply if you do not take the repair service.\n2. Fix the Leak: Leaks in accessible pipes or joints are repaired. Extra charges may apply if there are more than 3 leaks.\n3. Gas Refill: We share the gas refill price with you first. Gas is added only after your approval. Price depends on the AC gas type and AC capacity.\n4. Final Testing & Cleanup: We check the cooling and clean the work area after the service.",
                "inclusions": ["AC gas leakage inspection", "Leak repair for accessible pipes and joints", "AC gas refill after customer approval", "Cooling and AC performance check", "Basic cleanup after the service"],
                "exclusions": ["Spare parts and replacement charges", "Copper pipe replacement or major pipe repair", "Compressor, PCB, or fan motor repair", "AC installation or shifting", "Additional charges for more than 3 leakage points", "Extra gas charges if additional gas is required"],
                "notes": "Final repair cost depends on appliance condition and required parts. Technician confirms extra charges before work starts. Our warranty only covers parts provided by us, not parts you buy yourself.",
                "advance_paise": 4900,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "ac-uninstallation",
                "name": "AC Uninstallation",
                "is_active": True,
                "current_price": 849.00,
                "base_price": 1200.00,
                "duration": 90,
                "short_description": "Safe AC removal with gas lock, unit removal, and basic packing guidance.",
                "full_description": "Quick Check: We inspect your AC to make sure everything is working properly before starting.\nSafe Disconnection: We safely disconnect all power wires, gas pipes, and water drain tubes.\nCareful Removal: We carefully take down both the inside and outside units without damaging your wall.\nClean & Final Check: We inspect the area to make sure everything is clean, safe, and ready.",
                "inclusions": ["Works for All Types: Safe removal of split ac.", "Safe Disconnection: Power wires and gas lines are disconnected safely and securely."],
                "exclusions": ["Spare Parts Extra: Replacement parts are charged separately.", "No Wall or Woodwork: Cementing, plastering, or carpentry work is not included.", "Ladder Needed: Please keep a ladder ready for the technician before the service.", "Warranty Rule: The warranty is valid only if you complete the service with us."],
                "notes": "Our warranty only covers parts provided by us, not parts you buy yourself.",
                "advance_paise": 4900,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "ac-installation",
                "name": "AC Installation",
                "is_active": True,
                "current_price": 1699.00,
                "base_price": 2200.00,
                "duration": 179,
                "short_description": "Standard split AC installation with fitting, mounting, and basic performance check.",
                "full_description": "Inspection: A trained technician visits your home to inspect the spot where the AC will be installed.\nQuotation: We calculate the cost and send you a clear price estimate for your approval before starting.\nInstallation: Our technician carefully installs your AC unit.\nFinal Test: They test the cooling and show you how to use the AC.",
                "inclusions": ["Checking the installation location", "Securely mounting the AC unit"],
                "exclusions": ["Extra Materials & Gas: Spare parts, gas refilling, copper pipes, and insulation are charged separately.", "Stand & Fittings: AC wall stands and mounting bolts are not included.", "Wall & Carpentry Work: Hole drilling (core cutting), wall patching, plastering, and woodwork are not covered.", "Ladder Required: We do not carry a ladder, so please keep one ready if needed.", "No Service, No Warranty: Warranty applies only if you go ahead with the service."],
                "notes": "Material and extra installation work are quoted separately before work starts. Our warranty only covers parts provided by us, not parts you buy yourself.",
                "advance_paise": 4900,
                "pricing_model": "FIXED_PRICE",
            },
        ],
    },
    # ----------------------------------------------------
    # 3. Home Appliances Repair
    # ----------------------------------------------------
    {
        "category_slug": "home-appliances-repair",
        "category_name": "Home Appliances Repair",
        "category_desc": "Repair, servicing, installation, and maintenance for essential home appliances.",
        "services": [
            {
                "slug": "tv-repair-services",
                "name": "TV Repair & Services",
                "is_active": True,
                "current_price": 199.00,
                "base_price": 300.00,
                "duration": 60,
                "short_description": "TV display, sound, power, and connectivity issue diagnosis.",
                "full_description": "Inspection and service estimate for LED, LCD, and smart TVs facing no display, no sound, power, remote, or input issues.",
                "inclusions": ["Technician visit", "Issue diagnosis", "Basic external inspection", "Service estimate before extra work"],
                "exclusions": ["Panel replacement", "Motherboard or speaker parts", "Wall mount bracket", "Brand warranty handling"],
                "notes": "Final repair cost depends on appliance condition and required parts. Technician confirms extra charges before work starts.",
                "advance_paise": 9900,
                "pricing_model": "INSPECTION_BASED",
            },
            {
                "slug": "geyser-repair-services",
                "name": "Geyser Repair & Services",
                "is_active": True,
                "current_price": 199.00,
                "base_price": 249.00,
                "duration": 60,
                "short_description": "Geyser heating, leakage, wiring, thermostat, and servicing support.",
                "full_description": "Technician visit for electric geyser problems such as no heating, slow heating, leakage, tripping, or unusual noise.",
                "inclusions": ["Technician visit", "Issue diagnosis", "Basic external inspection", "Service estimate before extra work"],
                "exclusions": ["Heating element or thermostat parts", "Plumbing changes", "Wall drilling", "Electrical line repair"],
                "notes": "Water and power supply must be available for testing.",
                "advance_paise": 4900,
                "pricing_model": "INSPECTION_BASED",
            },
            {
                "slug": "microwave-oven-repair-services",
                "name": "Microwave Oven Repair & Services",
                "is_active": True,
                "current_price": 199.00,
                "base_price": 349.00,
                "duration": 60,
                "short_description": "Microwave heating, plate rotation, spark, and power issue diagnosis.",
                "full_description": "Technician visit for microwave ovens with heating failure, turntable issues, sparking, buttons not working, or power faults.",
                "inclusions": ["Technician visit", "Issue diagnosis", "Basic external inspection", "Service estimate before extra work"],
                "exclusions": ["Magnetron, diode, capacitor, fuse, panel, or door parts", "Internal deep cleaning"],
                "notes": "Final repair cost depends on appliance condition and required parts. Technician confirms extra charges before work starts.",
                "advance_paise": 4900,
                "pricing_model": "INSPECTION_BASED",
            },
            {
                "slug": "dishwasher-repair-service",
                "name": "Dishwasher Repair & Service",
                "is_active": True,
                "current_price": 549.00,
                "base_price": 699.00,
                "duration": 75,
                "short_description": "Dishwasher drainage, cleaning, water inlet, and noise issue diagnosis.",
                "full_description": "Service visit for dishwashers with poor cleaning, water not draining, water inlet errors, unusual noise, or cycle interruptions.",
                "inclusions": ["Technician visit", "Issue diagnosis", "Basic external inspection", "Service estimate before extra work"],
                "exclusions": ["Pump, motor, sensor, spray arm, or control-board parts", "Plumbing or cabinet modifications"],
                "notes": "Final repair cost depends on appliance condition and required parts. Technician confirms extra charges before work starts.",
                "advance_paise": 0,
                "pricing_model": "INSPECTION_BASED",
            },
            {
                "slug": "tv-wall-mount-installation",
                "name": "TV Wall Mount Installation",
                "is_active": True,
                "current_price": 599.00,
                "base_price": 799.00,
                "duration": 75,
                "short_description": "Secure TV wall mounting with alignment and basic setup.",
                "full_description": "Installation service for mounting a TV on a suitable wall, aligning the bracket, and checking viewing position and cable access.",
                "inclusions": ["Wall mount installation", "TV mounting and alignment", "Basic safety check", "Cable position guidance"],
                "exclusions": ["Wall mount bracket", "Concealed wiring", "Electrical socket work", "Civil repair or reinforcement"],
                "notes": "Customer should provide a compatible wall mount bracket unless arranged separately.",
                "advance_paise": 4900,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "cctv-cameras-repair-installation",
                "name": "CCTV Cameras Repair and Installation",
                "is_active": True,
                "current_price": 249.00,
                "base_price": 349.00,
                "duration": 90,
                "short_description": "CCTV camera setup, connection checks, and repair inspection.",
                "full_description": "Technician visit for CCTV installation or troubleshooting camera, DVR/NVR, power, display, or cable connectivity issues.",
                "inclusions": ["Camera point inspection", "Basic installation or repair estimate", "DVR/NVR connection check", "Live-view guidance"],
                "exclusions": ["Cameras, DVR/NVR, hard disk, cable, adapter, or networking equipment", "High-ladder or concealed wiring work"],
                "notes": "Final cost depends on number of camera points and material required.",
                "advance_paise": 4900,
                "pricing_model": "INSPECTION_BASED",
            },
            {
                "slug": "ac-inspection-charge",
                "name": "AC Inspection Charge (Appliances)",
                "is_active": True,
                "current_price": 299.00,
                "base_price": 299.00,
                "duration": 45,
                "short_description": "Technician visit to inspect AC cooling, airflow, power, leakage, or noise issues.",
                "full_description": "AC inspection visit for split or window AC units. The technician diagnoses the issue and confirms the repair estimate before extra work starts.",
                "inclusions": ["Quick AC Check – We check your AC and find the exact problem.", "Clear Price – We tell you the repair cost before starting the work.", "Your Approval First – We start the repair only after you approve the cost."],
                "exclusions": ["Spare parts", "Gas refill", "Deep cleaning", "Installation or uninstallation"],
                "notes": "Final repair cost depends on appliance condition and required parts. Technician confirms extra charges before work starts.",
                "advance_paise": 4900,
                "pricing_model": "INSPECTION_BASED",
            },
            {
                "slug": "geyser-installation",
                "name": "Geyser Installation",
                "is_active": True,
                "current_price": 499.00,
                "base_price": 650.00,
                "duration": 75,
                "short_description": "Geyser installation with mounting, connection check, and basic testing.",
                "full_description": "Geyser installation service for suitable bathroom or utility wall points.",
                "inclusions": ["Mounting guidance", "Connection check", "Basic testing", "Safety guidance"],
                "exclusions": ["Plumbing materials", "Electrical wiring", "Wall drilling beyond standard fitting", "Old unit removal"],
                "notes": "Customer must provide compatible installation point and required materials.",
                "advance_paise": 4900,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "tv-wall-mount-up-to-26-inch",
                "name": "TV Wall Mount - Up to 26 inch",
                "is_active": True,
                "current_price": 399.00,
                "base_price": 399.00,
                "duration": 60,
                "short_description": "TV wall mount installation for screens up to 26 inches.",
                "full_description": "Wall mounting service for small TVs with alignment and basic safety check.",
                "inclusions": ["Wall mount fitting", "TV placement and alignment", "Basic safety check"],
                "exclusions": ["Bracket", "Concealed wiring", "Electrical or civil work"],
                "notes": "Customer should provide a compatible bracket.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "tv-wall-mount-32-to-43-inch",
                "name": "TV Wall Mount - 32 to 43 inch",
                "is_active": True,
                "current_price": 599.00,
                "base_price": 599.00,
                "duration": 75,
                "short_description": "TV wall mount installation for 32 to 43 inch screens.",
                "full_description": "Wall mounting service for medium TVs with bracket alignment and safe placement.",
                "inclusions": ["Wall mount fitting", "TV placement and alignment", "Basic safety check"],
                "exclusions": ["Bracket", "Concealed wiring", "Electrical or civil work"],
                "notes": "Customer should provide a compatible bracket.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "tv-wall-mount-46-to-55-inch",
                "name": "TV Wall Mount - 46 to 55 inch",
                "is_active": True,
                "current_price": 699.00,
                "base_price": 699.00,
                "duration": 90,
                "short_description": "TV wall mount installation for 46 to 55 inch screens.",
                "full_description": "Wall mounting service for large TVs with positioning and alignment support.",
                "inclusions": ["Wall mount fitting", "TV placement and alignment", "Basic safety check"],
                "exclusions": ["Bracket", "Concealed wiring", "Electrical or civil work"],
                "notes": "Customer should provide a compatible bracket.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "tv-wall-mount-56-to-65-inch",
                "name": "TV Wall Mount - 56 to 65 inch",
                "is_active": True,
                "current_price": 899.00,
                "base_price": 899.00,
                "duration": 105,
                "short_description": "TV wall mount installation for 56 to 65 inch screens.",
                "full_description": "Wall mounting service for extra-large TVs with careful alignment and safety check.",
                "inclusions": ["Wall mount fitting", "TV placement and alignment", "Basic safety check"],
                "exclusions": ["Bracket", "Concealed wiring", "Electrical or civil work"],
                "notes": "Customer should provide a compatible bracket and safe wall surface.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "tv-wall-mount-over-75-inch",
                "name": "TV Wall Mount - Over 75 inch",
                "is_active": True,
                "current_price": 1899.00,
                "base_price": 1899.00,
                "duration": 150,
                "short_description": "TV wall mount installation for premium large-screen TVs over 75 inches.",
                "full_description": "Specialist wall mount visit for very large TVs with alignment and safety guidance.",
                "inclusions": ["Wall mount fitting", "TV placement and alignment", "Basic safety check"],
                "exclusions": ["Bracket", "Concealed wiring", "Electrical or civil work", "Additional helper charges if required"],
                "notes": "Site feasibility will be confirmed before installation.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
        ],
    },
    # ----------------------------------------------------
    # 4. Cleaning
    # ----------------------------------------------------
    {
        "category_slug": "cleaning",
        "category_name": "Cleaning",
        "category_desc": "Home, bathroom, tank, and chimney cleaning services for healthier spaces.",
        "services": [
            {
                "slug": "chimney-cleaning-services",
                "name": "Chimney Cleaning Service",
                "is_active": True,
                "current_price": 250.00,
                "base_price": 300.00,
                "duration": 75,
                "short_description": "Kitchen chimney filter, hood, and grease cleaning service.",
                "full_description": "Cleaning service for kitchen chimneys affected by grease, smoke residue, and reduced suction. Helps improve airflow and kitchen hygiene.",
                "inclusions": ["Filter cleaning", "Hood surface cleaning", "Accessible grease removal", "Basic suction check"],
                "exclusions": ["Motor repair", "Duct replacement", "Spare parts", "Deep duct dismantling"],
                "notes": "Heavy grease buildup may need additional time or repeat cleaning.",
                "advance_paise": 4900,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "full-house-cleaning",
                "name": "Full House Cleaning",
                "is_active": True,
                "current_price": 1999.00,
                "base_price": 2499.00,
                "duration": 240,
                "short_description": "Complete home cleaning for floors, surfaces, rooms, and common areas.",
                "full_description": "A full-house cleaning visit for occupied homes that need deep dusting, floor cleaning, bathroom touch-up, kitchen surface cleaning, and room-wise hygiene care.",
                "inclusions": ["Room dusting", "Floor cleaning", "Kitchen exterior surface cleaning", "Bathroom touch-up", "Common area cleaning"],
                "exclusions": ["Pest control", "Interior cabinet cleaning", "Sofa or mattress shampooing", "Paint or renovation cleanup"],
                "notes": "Exact scope and duration depend on home size and condition.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "bathroom-cleaning",
                "name": "Bathroom Cleaning",
                "is_active": True,
                "current_price": 499.00,
                "base_price": 699.00,
                "duration": 60,
                "short_description": "Bathroom tile, floor, mirror, tap, and fixture cleaning.",
                "full_description": "Bathroom cleaning service focused on stains, scale, floor dirt, mirror marks, fixture buildup, and overall freshness.",
                "inclusions": ["Floor and wall tile cleaning", "Tap and fixture cleaning", "Mirror cleaning", "Commode and basin cleaning", "Basic deodorizing"],
                "exclusions": ["Plumbing repair", "Grout replacement", "Severe hard-water restoration", "Pest control"],
                "notes": "Very old stains may lighten but may not disappear completely in one visit.",
                "advance_paise": 14900,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "water-tank-cleaning",
                "name": "Water Tank Cleaning",
                "is_active": True,
                "current_price": 999.00,
                "base_price": 1299.00,
                "duration": 120,
                "short_description": "Overhead or sump tank cleaning for sediment and hygiene buildup.",
                "full_description": "Water tank cleaning service to remove settled dirt, slime, and visible buildup from accessible domestic water tanks.",
                "inclusions": ["Tank draining support", "Manual scrubbing", "Sludge removal", "Rinse and basic hygiene check"],
                "exclusions": ["Tank repair", "Plumbing repair", "Chemical treatment beyond standard cleaning", "High-risk access work"],
                "notes": "Customer must provide safe tank access and water/power availability.",
                "advance_paise": 24900,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "deep-cleaning-wall-mount-chimney",
                "name": "Deep Cleaning - Wall-mount Chimney",
                "is_active": False,
                "current_price": 1199.00,
                "base_price": 1199.00,
                "duration": 90,
                "short_description": "Deep grease cleaning for wall-mount kitchen chimney.",
                "full_description": "Deep cleaning package for wall-mount chimneys with heavy oil and grease buildup.",
                "inclusions": ["Filter cleaning", "Hood cleaning", "Accessible grease removal", "Basic suction check"],
                "exclusions": ["Motor repair", "Duct replacement", "Spare parts"],
                "notes": "Heavy buildup may require additional time.",
                "advance_paise": 10000,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "deep-cleaning-island-chimney",
                "name": "Deep Cleaning - Island Chimney",
                "is_active": False,
                "current_price": 1499.00,
                "base_price": 1499.00,
                "duration": 120,
                "short_description": "Deep grease cleaning for island kitchen chimney.",
                "full_description": "Deep cleaning package for island chimneys with filter, hood, and accessible grease cleaning.",
                "inclusions": ["Filter cleaning", "Hood cleaning", "Accessible grease removal", "Basic suction check"],
                "exclusions": ["Motor repair", "Duct replacement", "Spare parts"],
                "notes": "Safe ladder access is required.",
                "advance_paise": 10000,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "chimney-installation-wall-mount-chimney",
                "name": "Chimney Installation - Wall-mount Chimney",
                "is_active": False,
                "current_price": 699.00,
                "base_price": 699.00,
                "duration": 90,
                "short_description": "Installation service for wall-mount kitchen chimney.",
                "full_description": "Wall-mount chimney installation with fitting and basic operating check.",
                "inclusions": ["Chimney mounting", "Alignment", "Basic operating check"],
                "exclusions": ["Duct, clamp, wiring, drilling beyond standard fitting, or civil work"],
                "notes": "Customer must provide compatible chimney and installation materials.",
                "advance_paise": 10000,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "chimney-installation-island-chimney",
                "name": "Chimney Installation - Island Chimney",
                "is_active": False,
                "current_price": 1499.00,
                "base_price": 1499.00,
                "duration": 150,
                "short_description": "Installation service for island kitchen chimney.",
                "full_description": "Island chimney installation with alignment, mounting, and basic operating check.",
                "inclusions": ["Chimney mounting", "Alignment", "Basic operating check"],
                "exclusions": ["Duct, clamp, wiring, drilling beyond standard fitting, or civil work"],
                "notes": "Site feasibility is confirmed before installation.",
                "advance_paise": 10000,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "overhead-water-tank-cleaning-up-to-1000-litres",
                "name": "Overhead Water Tank Cleaning - Up to 1000 Litres",
                "is_active": True,
                "current_price": 779.00,
                "base_price": 779.00,
                "duration": 90,
                "short_description": "Overhead water tank cleaning for tanks up to 1000 litres.",
                "full_description": "Cleaning package for accessible overhead tanks up to 1000 litres.",
                "inclusions": ["Draining support", "Scrubbing", "Sludge removal", "Rinse"],
                "exclusions": ["Tank repair", "Plumbing work", "Chemical treatment beyond standard cleaning"],
                "notes": "Safe access and water availability are required.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "overhead-water-tank-cleaning-1000-to-3000-litres",
                "name": "Overhead Water Tank Cleaning - 1000 to 3000 Litres",
                "is_active": True,
                "current_price": 1049.00,
                "base_price": 1049.00,
                "duration": 120,
                "short_description": "Overhead water tank cleaning for 1000 to 3000 litre tanks.",
                "full_description": "Cleaning package for accessible overhead tanks from 1000 to 3000 litres.",
                "inclusions": ["Draining support", "Scrubbing", "Sludge removal", "Rinse"],
                "exclusions": ["Tank repair", "Plumbing work", "Chemical treatment beyond standard cleaning"],
                "notes": "Safe access and water availability are required.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "overhead-water-tank-cleaning-3000-to-6000-litres",
                "name": "Overhead Water Tank Cleaning - 3000 to 6000 Litres",
                "is_active": True,
                "current_price": 1449.00,
                "base_price": 1449.00,
                "duration": 150,
                "short_description": "Overhead water tank cleaning for 3000 to 6000 litre tanks.",
                "full_description": "Cleaning package for accessible overhead tanks from 3000 to 6000 litres.",
                "inclusions": ["Draining support", "Scrubbing", "Sludge removal", "Rinse"],
                "exclusions": ["Tank repair", "Plumbing work", "Chemical treatment beyond standard cleaning"],
                "notes": "Safe access and water availability are required.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "overhead-water-tank-cleaning-6000-to-10000-litres",
                "name": "Overhead Water Tank Cleaning - 6000 to 10000 Litres",
                "is_active": True,
                "current_price": 2499.00,
                "base_price": 2499.00,
                "duration": 180,
                "short_description": "Overhead water tank cleaning for 6000 to 10000 litre tanks.",
                "full_description": "Cleaning package for accessible overhead tanks from 6000 to 10000 litres.",
                "inclusions": ["Draining support", "Scrubbing", "Sludge removal", "Rinse"],
                "exclusions": ["Tank repair", "Plumbing work", "Chemical treatment beyond standard cleaning"],
                "notes": "Safe access and water availability are required.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "overhead-concrete-water-tank-cleaning-up-to-1000-litres",
                "name": "Overhead Concrete Water Tank Cleaning - Up to 1000 Litres",
                "is_active": True,
                "current_price": 1199.00,
                "base_price": 1199.00,
                "duration": 120,
                "short_description": "Concrete overhead tank cleaning for tanks up to 1000 litres.",
                "full_description": "Cleaning package for accessible concrete overhead tanks up to 1000 litres.",
                "inclusions": ["Draining support", "Scrubbing", "Sludge removal", "Rinse"],
                "exclusions": ["Tank repair", "Plumbing work", "Chemical treatment beyond standard cleaning"],
                "notes": "Safe access and water availability are required.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "overhead-concrete-water-tank-cleaning-1000-to-3000-litres",
                "name": "Overhead Concrete Water Tank Cleaning - 1000 to 3000 Litres",
                "is_active": True,
                "current_price": 1499.00,
                "base_price": 1499.00,
                "duration": 150,
                "short_description": "Concrete overhead tank cleaning for 1000 to 3000 litre tanks.",
                "full_description": "Cleaning package for accessible concrete overhead tanks from 1000 to 3000 litres.",
                "inclusions": ["Draining support", "Scrubbing", "Sludge removal", "Rinse"],
                "exclusions": ["Tank repair", "Plumbing work", "Chemical treatment beyond standard cleaning"],
                "notes": "Safe access and water availability are required.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "underground-sump-cleaning-up-to-5000-litres",
                "name": "Underground Sump Cleaning - Up to 5000 Litres",
                "is_active": True,
                "current_price": 1399.00,
                "base_price": 1399.00,
                "duration": 150,
                "short_description": "Underground sump cleaning for sumps up to 5000 litres.",
                "full_description": "Cleaning package for accessible underground sumps up to 5000 litres.",
                "inclusions": ["Draining support", "Scrubbing", "Sludge removal", "Rinse"],
                "exclusions": ["Sump repair", "Motor or plumbing work", "High-risk confined-space work"],
                "notes": "Safe access and water disposal path are required.",
                "advance_paise": 10000,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "underground-sump-cleaning-5000-to-8000-litres",
                "name": "Underground Sump Cleaning - 5000 to 8000 Litres",
                "is_active": True,
                "current_price": 1899.00,
                "base_price": 1899.00,
                "duration": 180,
                "short_description": "Underground sump cleaning for 5000 to 8000 litre sumps.",
                "full_description": "Cleaning package for accessible underground sumps from 5000 to 8000 litres.",
                "inclusions": ["Draining support", "Scrubbing", "Sludge removal", "Rinse"],
                "exclusions": ["Sump repair", "Motor or plumbing work", "High-risk confined-space work"],
                "notes": "Safe access and water disposal path are required.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "underground-sump-cleaning-8000-to-12000-litres",
                "name": "Underground Sump Cleaning - 8000 to 12000 Litres",
                "is_active": True,
                "current_price": 2349.00,
                "base_price": 2349.00,
                "duration": 210,
                "short_description": "Underground sump cleaning for 8000 to 12000 litre sumps.",
                "full_description": "Cleaning package for accessible underground sumps from 8000 to 12000 litres.",
                "inclusions": ["Draining support", "Scrubbing", "Sludge removal", "Rinse"],
                "exclusions": ["Sump repair", "Motor or plumbing work", "High-risk confined-space work"],
                "notes": "Safe access and water disposal path are required.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "underground-sump-cleaning-12000-to-20000-litres",
                "name": "Underground Sump Cleaning - 12000 to 20000 Litres",
                "is_active": True,
                "current_price": 3899.00,
                "base_price": 3899.00,
                "duration": 240,
                "short_description": "Underground sump cleaning for 12000 to 20000 litre sumps.",
                "full_description": "Cleaning package for accessible underground sumps from 12000 to 20000 litres.",
                "inclusions": ["Draining support", "Scrubbing", "Sludge removal", "Rinse"],
                "exclusions": ["Sump repair", "Motor or plumbing work", "High-risk confined-space work"],
                "notes": "Safe access and water disposal path are required.",
                "advance_paise": 0,
                "pricing_model": "FIXED_PRICE",
            },
        ],
    },
    # ----------------------------------------------------
    # 5. Washing Machine
    # ----------------------------------------------------
    {
        "category_slug": "washing-machine",
        "category_name": "Washing Machine",
        "category_desc": "Washing machine repair, installation and uninstallation.",
        "services": [
            {
                "slug": "washing-machine-repair-service",
                "name": "Washing Machine Repair Inspection",
                "is_active": True,
                "current_price": 199.00,
                "base_price": 299.00,
                "duration": 48,
                "short_description": "Diagnosis and service for washing, spinning, draining, and noise issues.",
                "full_description": "Quick Washing Machine Check – We check your Washing Machine and find the exact problem.\nClear Price – We tell you the repair cost before starting the work.\nYour Approval First – We start the repair only after you approve the cost.",
                "inclusions": ["Clear Quote: We will fully inspect your appliance first and give you the exact repair price before starting any work."],
                "exclusions": [
                    "No Cleaning or Servicing: Deep cleaning or standard servicing is not included in this check-up.",
                    "No Carpentry, Plumbing, or Electrical Work: Any extra wood, pipe, or wiring work is not covered.",
                    "Inspection Fee Policy: The inspection fee only covers finding the issue. However, if you go ahead with repairs, this fee will be deducted from your final bill.",
                    "Spare Parts Pricing: Replacement part costs depend on your appliance's brand, so prices may vary.",
                    "Extra Labour Fee: If repairs or part replacements are needed, an additional labour charge applies",
                ],
                "notes": "Inspection Fee: The ₹299 inspection fee will be discounted from your total bill if you get the repair done with us. Spare Parts Warranty: Our warranty only covers parts supplied by us, not spare parts provided by the customer.",
                "advance_paise": 4900,
                "pricing_model": "INSPECTION_BASED",
            },
            {
                "slug": "washing-machine-installation",
                "name": "Washing Machine Installation",
                "is_active": False,
                "current_price": 599.00,
                "base_price": 599.00,
                "duration": 60,
                "short_description": "Install and test a compatible washing machine.",
                "full_description": "Install and test a compatible washing machine.",
                "inclusions": ["Machine placement", "Inlet and drain connection", "Basic function test"],
                "exclusions": ["Not specified"],
                "notes": "None listed",
                "advance_paise": 9900,
                "pricing_model": "FIXED_PRICE",
            },
            {
                "slug": "washing-machine-uninstallation",
                "name": "Washing Machine Uninstallation",
                "is_active": False,
                "current_price": 499.00,
                "base_price": 499.00,
                "duration": 60,
                "short_description": "Disconnect and prepare a washing machine for shifting.",
                "full_description": "Disconnect and prepare a washing machine for shifting.",
                "inclusions": ["Water inlet disconnection", "Drain disconnection", "Safe handover"],
                "exclusions": ["Not specified"],
                "notes": "None listed",
                "advance_paise": 9900,
                "pricing_model": "FIXED_PRICE",
            },
        ],
    },
    # ----------------------------------------------------
    # 6. Home Maintenance
    # ----------------------------------------------------
    {
        "category_slug": "home-maintenance",
        "category_name": "Home Maintenance",
        "category_desc": "Mosquito net, sofa repair, and other home maintenance visits.",
        "services": [
            {
                "slug": "mosquito-net-inspection-charge",
                "name": "Mosquito Net Inspection Charge",
                "is_active": True,
                "current_price": 249.00,
                "base_price": 300.00,
                "duration": 45,
                "short_description": "Inspection visit for mosquito net measurement, repair, or replacement estimate.",
                "full_description": "Inspection visit for mosquito net needs including measurement, repair feasibility, and estimate.",
                "inclusions": ["Technician visit", "Measurement guidance", "Repair or replacement estimate"],
                "exclusions": ["Net material", "Frame material", "Installation charges beyond inspection"],
                "notes": "Final price depends on window size, frame type, and material.",
                "advance_paise": 4900,
                "pricing_model": "INSPECTION_BASED",
            },
            {
                "slug": "sofa-repair-inspection-charge",
                "name": "Sofa Repair",
                "is_active": True,
                "current_price": 249.00,
                "base_price": 300.00,
                "duration": 45,
                "short_description": "Inspection visit for sofa repair scope, material requirement, and estimate.",
                "full_description": "Technician visit to inspect sofa damage, repair scope, fabric or foam needs, and final estimate.",
                "inclusions": ["Technician visit", "Damage inspection", "Repair estimate", "Material guidance"],
                "exclusions": ["Fabric, foam, wood, spring, or other materials", "Workshop transport"],
                "notes": "Final repair cost depends on sofa condition and selected material.",
                "advance_paise": 4900,
                "pricing_model": "INSPECTION_BASED",
            },
        ],
    },
    # ----------------------------------------------------
    # 7. Refrigerator
    # ----------------------------------------------------
    {
        "category_slug": "refrigerator",
        "category_name": "Refrigerator",
        "category_desc": "Refrigerator inspection, installation and uninstallation.",
        "services": [
            {
                "slug": "refrigerator-repair-services",
                "name": "Refrigerator Repair Inspection",
                "is_active": True,
                "current_price": 199.00,
                "base_price": 350.00,
                "duration": 60,
                "short_description": "Cooling, leakage, noise, and compressor-related refrigerator inspection.",
                "full_description": "Quick Refrigerator Check – We check your Refrigerator and find the exact problem.\nClear Price – We tell you the repair cost before starting the work.\nYour Approval First – We start the repair only after you approve the cost.",
                "inclusions": ["Clear Quote: We will fully inspect your appliance first and give you the exact repair price before starting any work."],
                "exclusions": [
                    "Check-up only: Cleaning or servicing your appliance isn't included in this inspection.",
                    "No electrical work: Electrical fixes or wiring jobs are not included.",
                    "Inspection fee policy: The inspection fee covers the diagnosis only. However, if you decide to go ahead with repairs, this fee will be deducted from your final bill.",
                    "Spare parts pricing: The cost of spare parts depends on your appliance's brand",
                    "Extra labour fee: If repairs or spare part replacements are needed, an additional labour charge applies",
                ],
                "notes": "Inspection Fee: The ₹299 inspection fee will be discounted from your total bill if you get the repair done with us. Spare Parts Warranty: Our warranty only covers parts supplied by us, not spare parts provided by the customer.",
                "advance_paise": 4900,
                "pricing_model": "INSPECTION_BASED",
            },
            {
                "slug": "refrigerator-installation-uninstallation",
                "name": "Refrigerator Installation / Uninstallation",
                "is_active": False,
                "current_price": 699.00,
                "base_price": 699.00,
                "duration": 60,
                "short_description": "Position, connect or safely disconnect a refrigerator.",
                "full_description": "Position, connect or safely disconnect a refrigerator.",
                "inclusions": ["Placement guidance", "Power and leveling check", "Basic cooling test or safe disconnection"],
                "exclusions": ["Not specified"],
                "notes": "None listed",
                "advance_paise": 9900,
                "pricing_model": "FIXED_PRICE",
            },
        ],
    },
]


class Command(BaseCommand):
    help = "Seed the canonical 13 NammaPros categories and exact sub-services, deactivating any extra categories/services."

    def handle(self, *args, **options):
        # Ensure active zones exist for coverage & pricing
        city, _ = City.objects.get_or_create(slug="chennai", defaults={"name": "Chennai", "is_active": True})
        city.is_active = True
        city.save()

        zones = []
        for name, pin in [("Anna Nagar", "600040"), ("Adyar", "600020"), ("T. Nagar", "600017"), ("Velachery", "600042")]:
            z, _ = Zone.objects.get_or_create(
                city=city,
                postal_code=pin,
                defaults={"name": name, "state": "Tamil Nadu", "operational_capacity": 50, "is_active": True},
            )
            z.is_active = True
            z.save()
            zones.append(z)

        raw_by_slug = {svc["slug"]: dict(svc) for cat in RAW_CATALOGUE for svc in cat["services"]}

        def from_raw(slug, **overrides):
            item = dict(raw_by_slug[slug])
            item.update(overrides)
            return item

        canonical_catalogue = [
            {
                "category_slug": "ac",
                "category_name": "AC",
                "category_desc": "General AC service, foam jet, chemical wash, repair, gas refill & installation.",
                "banner_img": "/images/banners/ac-service.png",
                "services": [
                    from_raw("general-ac-service", name="General AC Service", is_active=True),
                    from_raw("foam-jet-ac-service", name="Foam Jet AC Service", is_active=True, is_popular=True),
                    from_raw("ac-chemical-wash", name="AC Chemical Wash", is_active=True),
                    from_raw("ac-service", name="AC Inspection", is_active=True),
                    {
                        "slug": "ac-repair",
                        "name": "AC Repair",
                        "is_active": True,
                        "current_price": 249.00,
                        "duration": 45,
                        "short_description": "Inspection and repair estimate for cooling, PCB, compressor, fan motor, or leakage issues.",
                        "full_description": "Doorstep AC repair inspection. Our technician identifies the fault, shares the repair & spare-part quote upfront, and starts work only after your approval.",
                        "inclusions": ["AC fault inspection", "Repair cost & parts estimate before work", "Final cooling and operational check"],
                        "exclusions": ["Spare parts and gas charges as approved", "Civil or core cutting work"],
                        "advance_paise": 4900,
                        "pricing_model": "INSPECTION_BASED",
                    },
                    from_raw("ac-repair-gas-refill", name="AC Gas Refill", is_active=True),
                    from_raw("ac-installation", name="AC Installation", is_active=True),
                    from_raw("ac-uninstallation", name="AC Uninstallation", is_active=True),
                    from_raw("ac-uninstallation-installation", name="AC Uninstallation & Installation", is_active=True),
                    {
                        "slug": "ac-installation-with-chemical-wash",
                        "name": "AC Installation with Chemical Wash",
                        "is_active": True,
                        "current_price": None,
                        "duration": 180,
                        "short_description": "Full chemical wash of indoor/outdoor components paired with split or window AC installation.",
                        "full_description": "Combined service that deeply cleans coils, blower, and drain tray using a safe chemical wash before completing standard AC mounting and testing.",
                        "inclusions": ["Indoor chemical wash", "Standard split/window AC mounting", "Drainage check & cooling test"],
                        "exclusions": ["Extra copper pipe, outdoor stand, drain pipe, electrical wiring, and core cutting"],
                        "advance_paise": 0,
                        "pricing_model": "INSPECTION_BASED",
                    },
                ],
            },
            {
                "category_slug": "washing-machine",
                "category_name": "Washing Machine",
                "category_desc": "Washing machine repair, installation and uninstallation.",
                "banner_img": "/images/banners/washing-machine.png",
                "services": [
                    from_raw("washing-machine-repair-service", name="Washing Machine Repair Inspection", is_active=True, is_popular=True),
                    from_raw("washing-machine-installation", name="Washing Machine Installation", is_active=True),
                    from_raw("washing-machine-uninstallation", name="Washing Machine Uninstallation", is_active=True),
                ],
            },
            {
                "category_slug": "refrigerator",
                "category_name": "Refrigerator",
                "category_desc": "Refrigerator inspection, installation and uninstallation.",
                "banner_img": "/images/banners/refrigerator.png",
                "services": [
                    from_raw("refrigerator-repair-services", name="Refrigerator Repair Inspection", is_active=True),
                    from_raw("refrigerator-installation-uninstallation", name="Refrigerator Installation / Uninstallation", is_active=True),
                ],
            },
            {
                "category_slug": "tv",
                "category_name": "TV",
                "category_desc": "TV repair & services and TV wall mount installation by screen size.",
                "banner_img": "/images/banners/tv-repair.png",
                "services": [
                    from_raw("tv-repair-services", name="TV Repair & Services", is_active=True, is_popular=True),
                    from_raw("tv-wall-mount-up-to-26-inch", name="TV Wall Mount - Up to 26 inch", is_active=True),
                    from_raw("tv-wall-mount-32-to-43-inch", name="TV Wall Mount - 32 to 43 inch", is_active=True),
                    from_raw("tv-wall-mount-46-to-55-inch", name="TV Wall Mount - 46 to 55 inch", advance_paise=10000, is_active=True),
                    from_raw("tv-wall-mount-56-to-65-inch", name="TV Wall Mount - 56 to 65 inch", advance_paise=10000, is_active=True),
                    from_raw("tv-wall-mount-over-75-inch", name="TV Wall Mount - Over 75 inch", is_active=True),
                ],
            },
            {
                "category_slug": "geyser",
                "category_name": "Geyser",
                "category_desc": "Geyser repair, heating check, and installation.",
                "banner_img": "/images/banners/geyser.png",
                "services": [
                    from_raw("geyser-repair-services", name="Geyser Repair & Services", is_active=True),
                    from_raw("geyser-installation", name="Geyser Installation", is_active=True),
                ],
            },
            {
                "category_slug": "water-purifier",
                "category_name": "Water Purifier",
                "category_desc": "RO/UV water purifier repair, filter service, and maintenance.",
                "banner_img": "/images/banners/water-purifier.png",
                "services": [
                    from_raw("water-purifier-repair-services", name="Water Purifier Repair & Services", is_active=True),
                ],
            },
            {
                "category_slug": "microwave-oven",
                "category_name": "Microwave Oven",
                "category_desc": "Microwave oven inspection, heating, and control repair.",
                "banner_img": "/images/banners/microwave.png",
                "services": [
                    from_raw("microwave-oven-repair-services", name="Microwave Oven Repair & Services", is_active=True),
                ],
            },
            {
                "category_slug": "dishwasher",
                "category_name": "Dishwasher",
                "category_desc": "Dishwasher inspection, leakage, drain, and heating service.",
                "banner_img": "/images/banners/dishwasher.png",
                "services": [
                    from_raw("dishwasher-repair-service", name="Dishwasher Repair & Service", is_active=True),
                ],
            },
            {
                "category_slug": "cctv",
                "category_name": "CCTV",
                "category_desc": "CCTV camera & DVR/NVR repair and installation.",
                "banner_img": "/images/banners/cctv.png",
                "services": [
                    from_raw("cctv-cameras-repair-installation", name="CCTV Repair and Installation", is_active=True),
                ],
            },
            {
                "category_slug": "chimney",
                "category_name": "Chimney",
                "category_desc": "Chimney cleaning, deep cleaning & installation for wall-mounted or island chimneys.",
                "banner_img": "/images/services/chimney.png",
                "services": [
                    from_raw("chimney-cleaning-services", name="Chimney Cleaning", is_active=True),
                    from_raw("deep-cleaning-wall-mount-chimney", name="Deep Cleaning - Wall-mount Chimney", is_active=True),
                    from_raw("deep-cleaning-island-chimney", name="Deep Cleaning - Island Chimney", is_active=True),
                    from_raw("chimney-installation-wall-mount-chimney", name="Chimney Installation - Wall-mount Chimney", is_active=True),
                    from_raw("chimney-installation-island-chimney", name="Chimney Installation - Island Chimney", is_active=True),
                ],
            },
            {
                "category_slug": "water-tank-cleaning",
                "category_name": "Water Tank Cleaning",
                "category_desc": "Overhead water tank, concrete tank, and underground sump mechanized cleaning.",
                "banner_img": "/images/banners/water-tank-cleaning.png",
                "services": [
                    from_raw("overhead-water-tank-cleaning-up-to-1000-litres", advance_paise=10000, is_active=True, is_popular=True),
                    from_raw("overhead-water-tank-cleaning-1000-to-3000-litres", advance_paise=10000, is_active=True),
                    from_raw("overhead-water-tank-cleaning-3000-to-6000-litres", is_active=True),
                    from_raw("overhead-water-tank-cleaning-6000-to-10000-litres", is_active=True),
                    from_raw("overhead-concrete-water-tank-cleaning-up-to-1000-litres", is_active=True),
                    from_raw("overhead-concrete-water-tank-cleaning-1000-to-3000-litres", is_active=True),
                    from_raw("underground-sump-cleaning-up-to-5000-litres", advance_paise=10000, is_active=True),
                    from_raw("underground-sump-cleaning-5000-to-8000-litres", advance_paise=10000, is_active=True),
                    from_raw("underground-sump-cleaning-8000-to-12000-litres", is_active=True),
                    from_raw("underground-sump-cleaning-12000-to-20000-litres", is_active=True),
                ],
            },
            {
                "category_slug": "mosquito-net",
                "category_name": "Mosquito Net",
                "category_desc": "Mosquito net inspection for measurement, repair, or replacement.",
                "banner_img": "/images/banners/mosquito-net.png",
                "services": [
                    from_raw("mosquito-net-inspection-charge", name="Mosquito Net Inspection Charge", is_active=True),
                ],
            },
            {
                "category_slug": "sofa",
                "category_name": "Sofa",
                "category_desc": "Sofa repair inspection and upholstery/frame estimate.",
                "banner_img": "/images/banners/sofa-repair.png",
                "services": [
                    from_raw("sofa-repair-inspection-charge", name="Sofa Repair", is_active=True),
                ],
            },
        ]

        import re
        local_photo_keywords = [
            (["dishwasher"], "/images/banners/dishwasher.png"),
            (["washing", "washer"], "/images/banners/washing-machine.png"),
            (["refrigerator", "fridge"], "/images/banners/refrigerator.png"),
            (["microwave"], "/images/banners/microwave.png"),
            (["geyser"], "/images/banners/geyser.png"),
            (["purifier", "ro repair", "uv repair"], "/images/banners/water-purifier.png"),
            (["water tank", "sump"], "/images/banners/water-tank-cleaning.png"),
            (["mosquito"], "/images/banners/mosquito-net.png"),
            (["sofa"], "/images/banners/sofa-repair.png"),
            (["cctv", "security camera"], "/images/banners/cctv.png"),
            (["wall mount", "tv repair", "television"], "/images/banners/tv-repair.png"),
            (["chimney"], "/images/services/chimney.png"),
            (["foam jet", "chemical wash", "gas refill", "gas refil", "ac inspection", "ac uninstallation", "ac installation", "ac service", "ac repair"], "/images/banners/ac-service.png"),
        ]

        def resolve_local_photo(name):
            norm = name.lower()
            for keys, path in local_photo_keywords:
                if any(k in norm for k in keys):
                    return path
            if re.search(r"\b(ac|tv)\b", norm):
                return "/images/banners/tv-repair.png" if re.search(r"\btv\b", norm) else "/images/banners/ac-service.png"
            return "/images/banners/ac-service.png"

        canonical_category_slugs = [c["category_slug"] for c in canonical_catalogue]
        canonical_service_slugs = []
        total_categories = 0
        total_services = 0
        total_packages = 0
        active_packages = []

        # Clear old is_popular flags outside canonical set
        Service.objects.update(is_popular=False)

        for cat_order, cat_data in enumerate(canonical_catalogue, start=1):
            c_slug = cat_data["category_slug"]
            category, _ = Category.objects.update_or_create(
                slug=c_slug,
                defaults={
                    "name": cat_data["category_name"],
                    "description": cat_data["category_desc"],
                    "sort_order": cat_order,
                    "is_active": True,
                    "icon_url": f"/images/category-icons/{c_slug}.png",
                    "image_url": cat_data.get("banner_img", ""),
                },
            )
            total_categories += 1

            for s_order, s_data in enumerate(cat_data["services"], start=1):
                canonical_service_slugs.append(s_data["slug"])
                curr_price = s_data.get("current_price")
                base_price = s_data.get("base_price")
                selling_paise = int(round(curr_price * 100)) if curr_price is not None else None
                original_paise = (
                    int(round(base_price * 100))
                    if base_price is not None and selling_paise is not None and base_price > curr_price
                    else None
                )
                s_photo = resolve_local_photo(s_data["name"])
                service, _ = Service.objects.update_or_create(
                    slug=s_data["slug"],
                    defaults={
                        "category": category,
                        "name": s_data["name"],
                        "summary": s_data["short_description"][:240],
                        "description": s_data["full_description"],
                        "starting_price_paise": selling_paise,
                        "sort_order": s_order,
                        "is_active": s_data["is_active"],
                        "is_popular": bool(s_data.get("is_popular", False)),
                        "important_notes": s_data.get("notes", ""),
                        "inclusions": s_data.get("inclusions", []),
                        "exclusions": s_data.get("exclusions", []),
                        "cover_image_url": s_photo,
                        "landing_thumbnail_url": s_photo,
                        "list_image_url": s_photo,
                        "popup_cover_image_url": s_photo,
                        "popup_content_image_url": s_photo,
                    },
                )
                total_services += 1

                for z in zones:
                    cov, _ = ServiceCoverage.objects.get_or_create(service=service, zone=z)
                    cov.is_active = s_data["is_active"]
                    cov.save()

                pkg, _ = ServicePackage.objects.update_or_create(
                    service=service,
                    name=s_data["name"],
                    defaults={
                        "pricing_model": s_data["pricing_model"],
                        "duration_minutes": s_data["duration"],
                        "skill_code": f"{category.slug.upper().replace('-', '_')}_SPECIALIST",
                        "description": s_data["short_description"],
                        "inclusions": s_data["inclusions"],
                        "exclusions": s_data["exclusions"],
                        "original_price_paise": original_paise,
                        "is_active": s_data["is_active"],
                    },
                )
                total_packages += 1
                if s_data["is_active"]:
                    active_packages.append(pkg)

                if selling_paise is not None and selling_paise > 0:
                    adv_paise = s_data.get("advance_paise", 0)
                    policy = "ADVANCE" if adv_paise > 0 else "PREPAID"
                    adv_type = "FIXED" if adv_paise > 0 else "NONE"
                    is_inspection = (pkg.pricing_model == "INSPECTION_BASED")
                    base_paise_val = 0 if is_inspection else selling_paise
                    insp_paise_val = selling_paise if is_inspection else 0

                    for z in zones:
                        p_rule = PricingRule.objects.filter(package=pkg, zone=z).order_by("-version").first()
                        if not p_rule:
                            p_rule = PricingRule(package=pkg, zone=z, version=1)
                        p_rule.base_paise = base_paise_val
                        p_rule.inspection_paise = insp_paise_val
                        p_rule.payment_policy = policy
                        p_rule.advance_type = adv_type
                        p_rule.advance_amount_paise = adv_paise
                        p_rule.is_active = s_data["is_active"]
                        p_rule.save()

        # Deactivate any legacy/duplicate categories and services outside the canonical set
        deactivated_cats = Category.objects.exclude(slug__in=canonical_category_slugs).update(is_active=False)
        deactivated_svcs = Service.objects.exclude(slug__in=canonical_service_slugs).update(is_active=False)

        # Seed appointment slots for active packages across the next 7 days
        now = timezone.now()
        slot_count = 0
        for day_offset in range(1, 8):
            target_date = (now + datetime.timedelta(days=day_offset)).date()
            for hour in [9, 13, 16]:
                start_dt = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(hour, 0)))
                end_dt = start_dt + datetime.timedelta(hours=2)
                for pkg in active_packages:
                    for z in zones:
                        slot, created = AppointmentSlot.objects.get_or_create(
                            zone=z,
                            package=pkg,
                            start_at=start_dt,
                            end_at=end_dt,
                            defaults={"capacity": 5, "is_active": True},
                        )
                        if created:
                            slot_count += 1

        from django.core.cache import cache
        cache.clear()

        self.stdout.write(self.style.SUCCESS(
            f"Successfully populated canonical NammaPros catalogue!\n"
            f"- Categories active: {total_categories} (deactivated {deactivated_cats} extra)\n"
            f"- Sub-services active: {total_services} (deactivated {deactivated_svcs} extra)\n"
            f"- Packages: {total_packages}\n"
            f"- Generated appointment slots: {slot_count}"
        ))
