#!/usr/bin/env python3
"""
Content-pipeline pass 2 (verification) for the 60 catalog-imported assets.

Real URLs only, gathered via targeted web research this session — NOT the
catalog sheet's own citation text (which mostly names user-supplied PDFs and
prose citations with no URL, per the sheet's own README). Deliberately does
NOT trust the sheet's "Verification" column; `scripts/audit-content.mjs`
computes the real status from what's assembled here, same as every other
asset in the app.

Where only one real public source was findable, that asset gets one entry
and will audit as sourced_low_confidence or unverified — left honest rather
than padded to hit "verified".
"""
import json

SOURCES = {
    # ── Armor ──────────────────────────────────────────────────────────
    "side_a-armor-challenger-2": [
        ("Army Recognition — Challenger 2 in Ukraine (deployment, specs)",
         "https://www.armyrecognition.com/focus-analysis-conflicts/army/conflicts-in-the-world/russia-ukraine-war-2022/ukrainian-forces-deploy-british-donated-challenger-2-tanks-in-first-ever-offensive-on-russian-soil"),
        ("GlobalSecurity.org — Challenger 2 in Ukrainian service",
         "https://www.globalsecurity.org/military/world/ukraine/ua-challenger2.htm"),
    ],
    "side_a-armor-m1a1-abrams": [
        ("National Security Journal — Ukraine's M1A1 Abrams fleet",
         "https://nationalsecurityjournal.org/ukraine-has-49-new-m1a1-abrams-tanks-and-america-isnt-happy-one-bit/"),
        ("GlobalMilitary.net — M1A1 Abrams specifications",
         "https://www.globalmilitary.net/vehicles/m1-a1-abrams/"),
    ],
    "side_a-armor-t-64bv-t-64bm-bulat": [
        ("GlobalSecurity.org — T-64BM Bulat design",
         "https://www.globalsecurity.org/military/world/ukraine/t-64bm-design.htm"),
        ("Army Recognition — T-64BM Bulat technical data",
         "https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/t-64bm-bulat-ukraine-uk"),
    ],
    "side_a-armor-t-72amt-upgraded-t-72": [
        ("Wikipedia — T-72 (general lineage; AMT is a Ukrainian modernization of the same base tank)",
         "https://en.wikipedia.org/wiki/T-72"),
    ],
    "side_b-armor-t-90m-proryv": [
        ("Army Recognition — T-90M production ramp-up",
         "https://armyrecognition.com/news/army-news/2025/alert-russia-increases-production-of-most-modern-t-90m-tank-to-300-yearly-with-target-of-1-000-by-2028"),
        ("GlobalSecurity.org — T-90M Proryv-3",
         "https://www.globalsecurity.org/military/world/russia/t-90m-proryv-3.htm"),
    ],
    "side_b-armor-t-80bvm": [
        ("Army Recognition — T-80BVM technical data",
         "https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/t-80bvm-mbt-main-battle-tank-technical-data"),
        ("GlobalSecurity.org — T-80 characteristics",
         "https://www.globalsecurity.org/military/world/russia/t-80.htm"),
    ],
    "side_b-armor-t-14-armata": [
        ("Wikipedia — T-14 Armata", "https://en.wikipedia.org/wiki/T-14_Armata"),
        ("Army Technology — T-14 Armata Main Battle Tank",
         "https://www.army-technology.com/projects/t-14-armata-main-battle-tank/"),
    ],
    "side_b-armor-t-62m-refurbished-reserve-stock": [
        ("Army Recognition — Russia reactivates T-62M/T-62MV for Ukraine",
         "https://www.armyrecognition.com/focus-analysis-conflicts/army/conflicts-in-the-world/russia-ukraine-war-2022/russia-keeps-upgrading-soviet-era-t-62m-and-t-62mv-tanks-for-combat-in-ukraine"),
        ("GlobalSecurity.org — T-62MW tanks, Ukraine 2022",
         "https://www.globalsecurity.org/military/world/russia/t-62-2022.htm"),
    ],
    # ── IFV / APC ──────────────────────────────────────────────────────
    "side_a-armor-marder-1a3": [
        ("Wikipedia — Marder (infantry fighting vehicle)",
         "https://en.wikipedia.org/wiki/Marder_(infantry_fighting_vehicle)"),
        ("Army Recognition — Marder 1A3 first combat mission in Ukraine",
         "https://www.armyrecognition.com/focus-analysis-conflicts/army/conflicts-in-the-world/russia-ukraine-war-2022/marder-1a3-ifv-joins-ukraine-s-elite-unit-in-its-maiden-combat-mission"),
    ],
    "side_a-armor-m1126-icv-stryker": [
        ("Wikipedia — M1126 Infantry Carrier Vehicle",
         "https://en.wikipedia.org/wiki/M1126_infantry_carrier_vehicle"),
    ],
    "side_a-armor-m113-apc": [
        ("Militarnyi — M113: NATO's 'workhorse' in the Defense Forces of Ukraine",
         "https://militarnyi.com/en/articles/m113-nato-s-workhorse-in-defense-forces-of-ukraine/"),
        ("GlobalSecurity.org — M113 in Ukrainian service",
         "https://www.globalsecurity.org/military/world//ukraine/ua-m113.htm"),
    ],
    "side_a-armor-vab-apc": [
        ("Wikipedia — Véhicule de l'Avant Blindé (VAB)",
         "https://en.wikipedia.org/wiki/V%C3%A9hicule_de_l%27Avant_Blind%C3%A9"),
        ("Militarnyi — Ukrainian servicemen using French VAB APCs",
         "https://militarnyi.com/en/news/the-ukrainian-servicemen-are-using-the-french-vab-armored-personnel-carriers-on-the-front-line/"),
    ],
    "side_a-armor-bvs-10-viking": [
        ("Wikipedia — BvS10", "https://en.wikipedia.org/wiki/BvS10"),
        ("Army Recognition — Netherlands delivers BvS-10 Viking to Ukraine",
         "https://armyrecognition.com/news/army-news/army-news-2024/netherlands-delivers-28-viking-armored-vehicles-to-ukrainian-forces"),
    ],
    "side_b-armor-bmp-2": [
        ("Wikipedia — BMP-2", "https://en.wikipedia.org/wiki/BMP-2"),
        ("GlobalMilitary.net — BMP-2 specifications", "https://www.globalmilitary.net/vehicles/bmp-2/"),
    ],
    "side_b-armor-bmp-3": [
        ("Wikipedia — BMP-3", "https://en.wikipedia.org/wiki/BMP-3"),
        ("Army Recognition — Russia increases BMP-3 production for the Ukraine war",
         "https://www.armyrecognition.com/news/army-news/2026/russia-increases-bmp-3-ifv-production-40-with-new-drone-and-mine-protection-for-ukraine-war"),
    ],
    "side_b-armor-btr-82a": [
        ("Army Technology — BTR-82A Armoured Personnel Carrier",
         "https://www.army-technology.com/projects/btr-82a-armoured-personnel-carrier/"),
        ("Army Recognition — BTR-82A / BTR-82AM technical data",
         "https://www.armyrecognition.com/military-products/army/armoured-personnel-carriers/wheeled-vehicles/btr-82a-russia-uk"),
    ],
    # ── Artillery / MLRS ───────────────────────────────────────────────
    "side_a-artillery-caesar-155mm-self-propelled-gun": [
        ("Wikipedia — CAESAR self-propelled howitzer",
         "https://en.wikipedia.org/wiki/CAESAR_self-propelled_howitzer"),
        ("Army Recognition — CAESAR howitzers in Ukraine",
         "https://www.armyrecognition.com/focus-analysis-conflicts/army/conflicts-in-the-world/russia-ukraine-war-2022/french-caesar-155mm-howitzers-in-ukraine-considered-a-nightmare-for-russian-forces"),
    ],
    "side_a-artillery-pzh-2000": [
        ("GlobalSecurity.org — PzH 2000 self-propelled howitzer",
         "https://www.globalsecurity.org/military/world/europe/pzh2000.htm"),
        ("Army Recognition — German PzH 2000 howitzers for Ukraine",
         "https://www.armyrecognition.com/archives/archives-land-defense/land-defense-2024/exclusive-german-pzh-2000-howitzers-empower-ukraine-to-strike-deep-into-russian-territory"),
    ],
    "side_a-artillery-m109-paladin": [
        ("GlobalMilitary.net — M109 Paladin specifications",
         "https://www.globalmilitary.net/vehicles/m109/"),
        ("Army Recognition — M109A6 Paladin key to Ukraine's artillery",
         "https://www.armyrecognition.com/focus-analysis-conflicts/army/conflicts-in-the-world/russia-ukraine-war-2022/analysis-us-m109a6-paladin-155mm-howitzer-key-to-ukraines-artillery-superiority-in-the-fight-against-russia"),
    ],
    "side_a-artillery-2s22-bohdana": [
        ("Wikipedia — 2S22 Bohdana", "https://en.wikipedia.org/wiki/2S22_Bohdana"),
        ("Army Technology — 2S22 Bohdana Self-Propelled Howitzer",
         "https://www.army-technology.com/projects/2s22-bohdana-howitzer-ukraine/"),
    ],
    "side_a-artillery-m270a1-mlrs": [
        ("Wikipedia — M270 Multiple Launch Rocket System",
         "https://en.wikipedia.org/wiki/M270_Multiple_Launch_Rocket_System"),
        ("Army Technology — Norway, UK to provide more M270 MLRS to Ukraine",
         "https://www.army-technology.com/news/norway-uk-m270-mlrs-ukraine/"),
    ],
    "side_b-artillery-2s19-msta-s": [
        ("Wikipedia — 2S19 Msta", "https://en.wikipedia.org/wiki/2S19_Msta"),
    ],
    "side_b-artillery-2s7-pion-malka": [
        ("Wikipedia — 2S7 Pion", "https://en.wikipedia.org/wiki/2S7_Pion"),
        ("Military Factory — 2S7 Pion/Malka 203mm SPH",
         "https://www.militaryfactory.com/armor/detail.php?armor_id=143"),
    ],
    "side_b-artillery-bm-27-uragan": [
        ("Wikipedia — BM-27 Uragan", "https://en.wikipedia.org/wiki/BM-27_Uragan"),
        ("Army Technology — Uragan 9K57 MLRS", "https://www.army-technology.com/projects/uragan/"),
    ],
    "side_b-artillery-tos-1a": [
        ("Wikipedia — TOS-1", "https://en.wikipedia.org/wiki/TOS-1"),
        ("GlobalSecurity.org — TOS-1A Solntsepek",
         "https://www.globalsecurity.org/military/world/russia/tos-1a.htm"),
    ],
    # ── Air Defense ────────────────────────────────────────────────────
    "side_a-air-defense-nasams": [
        ("Wikipedia — NASAMS", "https://en.wikipedia.org/wiki/NASAMS"),
        ("Kongsberg — NASAMS Air Defence System (manufacturer)",
         "https://www.kongsberg.com/what-we-do/defence-and-security/integrated-air-and-missile-defence/nasams-air-defence-system/"),
    ],
    "side_a-air-defense-iris-t-slm": [
        ("Wikipedia — IRIS-T SL", "https://en.wikipedia.org/wiki/IRIS-T_SL"),
        ("Militarnyi — IRIS-T SLM tested in Ukraine",
         "https://militarnyi.com/en/news/iris-t-slm-air-defense-system-tested-in-ukraine-now-installed-on-german-navy-frigate/"),
    ],
    "side_a-air-defense-s-300-buk-m1-soviet-legacy": [
        ("Wikipedia — S-300 missile system", "https://en.wikipedia.org/wiki/S-300_missile_system"),
        ("Militarnyi — Ukraine's modernized Buk-M1 under FrankenSAM",
         "https://militarnyi.com/en/news/ukrainian-defence-forces-received-modernized-buk-m1-air-defense-systems/"),
    ],
    "side_b-air-defense-s-400-triumf": [
        ("GlobalSecurity.org — S-400 Triumf / SA-21 Growler",
         "https://www.globalsecurity.org/military/world/russia/s-400.htm"),
        ("CSIS Missile Threat — S-400 Triumf", "https://missilethreat.csis.org/defsys/s-400-triumf/"),
    ],
    "side_b-air-defense-buk-m3": [
        ("Army Recognition — Buk-M3 Viking 9K317M technical data",
         "https://www.armyrecognition.com/military-products/army/air-defense-systems/air-defense-vehicles/buk-m3-9k317m-medium-range-air-defense-missile-system-technical-data-sheet-specifications-11312154"),
        ("Missilery.info — 9K317M Buk-M3", "https://en.missilery.info/missile/bukm3"),
    ],
    "side_b-air-defense-tor-m2": [
        ("Army Recognition — Tor-M2 (SA-15) technical data",
         "https://www.armyrecognition.com/military-products/army/air-defense-systems/air-defense-vehicles/tor-m2-russia-uk"),
    ],
    "side_b-air-defense-s-300-soviet-legacy": [
        ("Wikipedia — S-300 missile system", "https://en.wikipedia.org/wiki/S-300_missile_system"),
    ],
    # ── UAV — long range strike ────────────────────────────────────────
    "side_a-uav-an-196-lyutyy": [
        ("Wikipedia — Liutyi", "https://en.wikipedia.org/wiki/Liutyi"),
        ("Covert Shores (H I Sutton) — Guide to Ukraine's long-range attack drones",
         "https://www.hisutton.com/Ukraine-OWA-UAVs.html"),
    ],
    "side_a-uav-aq-400-scythe": [
        ("Wikipedia — Terminal Autonomy AQ-400 Scythe",
         "https://en.wikipedia.org/wiki/Terminal_Autonomy_AQ-400_Scythe"),
        ("Militarnyi — Ukrainian military received AQ-400 Scythe UAVs",
         "https://militarnyi.com/en/news/the-ukrainian-military-received-aq-400-scythe-long-range-unmanned-aerial-vehicles/"),
    ],
    "side_a-uav-fp-1-fp-2": [
        ("Wikipedia — Fire Point FP-1", "https://en.wikipedia.org/wiki/Fire_Point_FP-1"),
        ("Covert Shores (H I Sutton) — Ukrainian FP-1/FP-2 deep strike drones",
         "https://www.hisutton.com/FP-1-Drone.html"),
    ],
    "side_a-uav-uj-26-beaver-bober": [
        ("Wikipedia — Bober (drone)", "https://en.wikipedia.org/wiki/Bober_(drone)"),
        ("Covert Shores (H I Sutton) — Guide to Ukraine's long-range attack drones",
         "https://www.hisutton.com/Ukraine-OWA-UAVs.html"),
    ],
    "side_a-uav-zozulia": [
        ("Euromaidan Press — Zozulia drones striking Russian supply lines",
         "https://euromaidanpress.com/2026/04/29/zozulia-drone/"),
    ],
    # ── UAV — strike/loitering ─────────────────────────────────────────
    "side_a-uav-bayraktar-tb2": [
        ("Wikipedia — Bayraktar TB2", "https://en.wikipedia.org/wiki/Bayraktar_TB2"),
    ],
    "side_a-uav-switchblade-300": [
        ("Wikipedia — Switchblade (missile)", "https://en.wikipedia.org/wiki/Switchblade_(missile)"),
    ],
    "side_a-uav-switchblade-600": [
        ("Wikipedia — Switchblade (missile)", "https://en.wikipedia.org/wiki/Switchblade_(missile)"),
    ],
    "side_a-uav-punisher": [
        ("Military Factory — UA Dynamics Punisher reusable attack drone",
         "https://www.militaryfactory.com/aircraft/detail.php?aircraft_id=2494"),
        ("UkraineWorld — The Punisher: an impressive drone produced in Ukraine",
         "https://ukraineworld.org/en/articles/analysis/punisher-drone-ukraine"),
    ],
    "side_b-uav-shahed-136-geran-2": [
        ("Wikipedia — HESA Shahed 136", "https://en.wikipedia.org/wiki/HESA_Shahed_136"),
        ("Covert Shores (H I Sutton) — Guide to Russian Shahed/Geran strike drones",
         "https://www.hisutton.com/Russian-Geran-Shahed-Drones.html"),
    ],
    "side_b-uav-gerbera": [
        ("Wikipedia — Gerbera (drone)", "https://en.wikipedia.org/wiki/Gerbera_(drone)"),
        ("Militarnyi — Russians significantly modernized Shahed and Gerbera drones",
         "https://militarnyi.com/en/news/ukrainian-defense-intelligence-russians-significantly-modernized-shahed-and-gerbera-drones/"),
    ],
    "side_b-uav-kub-1": [
        ("Wikipedia — ZALA Kub-BLA", "https://en.wikipedia.org/wiki/ZALA_Kub-BLA"),
        ("Army Recognition — Russia confirms deployment of KUB loitering munition",
         "https://www.armyrecognition.com/focus-analysis-conflicts/army/conflicts-in-the-world/russia-ukraine-war-2022/russia-confirms-deployement-in-ukraine-of-new-kub-loitering-munition-able-to-reach-target-at-50-km"),
    ],
    "side_b-uav-orion": [
        ("Wikipedia — Kronshtadt Orion", "https://en.wikipedia.org/wiki/Kronshtadt_Orion"),
        ("The National Interest — Is the Orion UAV Russia's answer to Ukraine's Turkish drones?",
         "https://nationalinterest.org/blog/buzz/orion-uav-russias-answer-ukraines-turkish-drones-198374"),
    ],
    "side_b-uav-forpost-ru": [
        ("Military Factory — Forpost ISR drone", "https://www.militaryfactory.com/aircraft/detail.php?aircraft_id=1486"),
        ("GlobalMilitary.net — IAI Forpost specs", "https://www.globalmilitary.net/aircraft/forpost/"),
    ],
    # ── UAV — reconnaissance ───────────────────────────────────────────
    "side_b-uav-zala-z-16": [
        ("Army Recognition — Russia upgrades Zala Z-16 with AI",
         "https://www.armyrecognition.com/focus-analysis-conflicts/army/conflicts-in-the-world/russia-ukraine-war-2022/russia-upgrades-zala-z-16-reconnaissance-drone-with-ai-to-autonomously-evade-ukrainian-drone-interceptors"),
        ("ZALA Aero — Z-16E product page (manufacturer)", "https://zala-aero.com/en/product/zala-z-16/"),
    ],
    "side_b-uav-supercam-s350": [
        ("Army Recognition — Russia unveils Supercam S350",
         "https://www.armyrecognition.com/archives/archives-defense-exhibitions/2026-archives-news-defense-exhibitions/world-defense-show-2026/russia-unveils-supercam-s350-drone-with-240-km-range-for-artillery-targeting-operations-2"),
    ],
    # ── Naval ──────────────────────────────────────────────────────────
    "side_a-naval-mantas-t-12": [
        ("MARTAC Systems — MANTAS T12 (manufacturer)", "https://martacsystems.com/products/t12/"),
        ("Naval Technology — MANTAS T-Series USVs",
         "https://www.naval-technology.com/projects/mantas-t-series-unmanned-surface-vessels-usv/"),
    ],
    "side_a-naval-sonobot-5": [],  # PDF-only in the catalog; no public URL found this pass
    # ── UGVs — Ukraine ─────────────────────────────────────────────────
    "side_a-ground-robots-nrtk-ironclad": [
        ("Euromaidan Press — Ironclad wheeled combat robot",
         "https://euromaidanpress.com/2024/01/13/ironclad-ukrainian-wheeled-combat-robot-destroys-russian-positions/"),
        ("Army Recognition — Ukraine to deploy articulated Ironclad UGV",
         "https://armyrecognition.com/focus-analysis-conflicts/army/conflicts-in-the-world/russia-ukraine-war-2022/ukraine-to-deploy-articulated-ironclad-ugv-in-combat-operations"),
    ],
    "side_a-ground-robots-nprk-moroz": [
        ("Defense Express — Brave1 unveils the MOROZ reconnaissance system",
         "https://en.defence-ua.com/news/brave1_unveils_the_moroz_reconnaissance_system-10774.html"),
        ("Modern War Institute — Networked for War: lessons from Ukraine's ground robots",
         "https://mwi.westpoint.edu/networked-for-war-lessons-from-ukraines-ground-robots/"),
    ],
    "side_a-ground-robots-nrtk-ratel-s": [
        ("Defense Express — Ratel S suicide UGV-drone specifications",
         "https://en.defence-ua.com/weapon_and_tech/ukrainian_officials_reveal_the_ratel_s_suicide_ugv_drone_specifications_included-8355.html"),
        ("Army Recognition — Ratel S used to destroy a bridge",
         "https://www.armyrecognition.com/focus-analysis-conflicts/army/conflicts-in-the-world/russia-ukraine-war-2022/ukrainian-forces-use-ratel-s-ground-robot-to-revolutionize-robotic-warfare-in-bridge-destruction"),
    ],
    "side_a-ground-robots-nprk-mul": [],  # PDF-only in the catalog; no public URL found this pass
    "side_a-ground-robots-krab-m1": [],  # PDF-only in the catalog; no public URL found this pass
    # ── UGVs — Russia ──────────────────────────────────────────────────
    "side_b-ground-robots-kurier": [
        ("Militarnyi — Russian unmanned ground vehicles deployed against Ukraine",
         "https://militarnyi.com/en/articles/russian-unmanned-ground-vehicles-deployed-in-the-war-against-ukraine/"),
    ],
    "side_b-ground-robots-varan": [
        ("Militarnyi — Russian unmanned ground vehicles deployed against Ukraine",
         "https://militarnyi.com/en/articles/russian-unmanned-ground-vehicles-deployed-in-the-war-against-ukraine/"),
    ],
    "side_b-ground-robots-uran-9": [
        ("Wikipedia — Uran-9", "https://en.wikipedia.org/wiki/Uran-9"),
        ("Army Technology — Uran-9 Unmanned Ground Combat Vehicle",
         "https://www.army-technology.com/projects/uran-9-unmanned-ground-combat-vehicle/"),
    ],
    "side_b-ground-robots-uran-6": [
        ("Army Technology — Uran-6 Mine-Clearing Robot",
         "https://www.army-technology.com/projects/uran-6-mine-clearing-robot/"),
        ("Army Recognition — Russian Southern District engineers receive Uran-6",
         "https://armyrecognition.com/news/army-news/2020/russian-southern-district-engineers-receive-advanced-uran-6-mine-clearance-robot"),
    ],
    "side_b-ground-robots-omich-2": [
        ("Defence Blog — Russian Airborne units evaluate Omich-2",
         "https://defence-blog.com/russian-airborne-units-evaluate-omich-2-unmanned-vehicle/"),
        ("Militarnyi — Russian Omich robotic platform spotted near the combat zone",
         "https://militarnyi.com/en/news/russian-omich-robotic-platform-spotted-near-the-combat-zone/"),
    ],
}

def main():
    manifest = json.load(open("/tmp/claude-0/-home-user-Warfare/8341a50d-6747-53ae-8fca-57b1c7d1a0fd/scratchpad/catalog/manifest.json"))
    missing = []
    for m in manifest:
        aid = m["id"]
        if aid not in SOURCES:
            missing.append(aid)
            continue
        path = f"data/assets/{aid}.json"
        d = json.load(open(path))
        d["sources"] = [{"label": label, "url": url} for label, url in SOURCES[aid]]
        with open(path, "w") as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
            f.write("\n")
    print(f"Filled sources for {len(SOURCES)} assets.")
    if missing:
        print(f"NOT in SOURCES map ({len(missing)}) — left with empty sources:")
        for x in missing:
            print(" ", x)

if __name__ == "__main__":
    main()
