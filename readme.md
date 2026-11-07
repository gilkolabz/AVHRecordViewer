# AVH Record Viewer

A veterinary clinic **virtual patient-records** demo: enter a 5-digit color-coded owner number, open a virtual manilla folder, and read pets and documents inside — the same shape as a physical filing room.

## What it does

1. **Numpad entry** — five digits; each digit has a fixed color (see `schema/digit_colors.json`).
2. **Lookup** — open the owner folder, or choose to create one on a miss (never automatic).
3. **Virtual folder** — pets, documents, and scanned pages in one owner file.
4. **Capture** — camera / scan into the folder; OCR helpers are included for experiments.
5. **Variant launches** — splash vs direct numpad, folder overlay / pile / page-turn layouts as sibling programs.

## Try it

Hostparked on foobarch — launch selector:

[https://foobarch.net/torus/devops/AVHRecordViewer/ui/launch_linker.html](https://foobarch.net/torus/devops/AVHRecordViewer/ui/launch_linker.html)

## What's in this repo

```text
ui/           Screens and launch fragments
modules/      Registry, manager, init, capture, OCR, parse, virtual view
flow/         Journey artifacts (numpad, splash, folder variants)
data/         Demo owners, program / artifact catalogs
schema/       Owner record shape, digit colors
fragments/    Composable folder pieces
lib/          Bundled Tesseract workers for OCR demos
pwa/          Web app manifests per launch
config.json   Active flow + module routes
manifest.json PWA shell for the default launch
```

## Shape

HTML fragments load in a navi / foobarch shell. Facts live in a registry module; which screen comes next is a flow JSON plus a thin manager. Live demo records sit in `navi.storage`; published files sit on hostpark under `torus/devops/AVHRecordViewer/`.

## License / contact

Product of [Gilkolabz](https://gilkolabz.com).
