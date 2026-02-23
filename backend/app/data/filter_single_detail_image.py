#!/usr/bin/.env python3
"""Filter rows where `detail_images` has exactly one image URL ending with .jpg or .png.

Usage:
    python filter_single_detail_image.py input.csv output.csv

If `output.csv` is omitted, writes to `filtered_product_data.csv` in the same folder.
"""
import argparse
import csv
import re
from pathlib import Path

IMG_RE = re.compile(r"(https?://[^\s\'\"\)\]]+?\.(?:jpg|png))(?:\b|$)", re.IGNORECASE)


def filter_file(input_path: Path, output_path: Path) -> int:
    with input_path.open("r", encoding="utf-8-sig", newline="") as inf:
        reader = csv.DictReader(inf)
        fieldnames = reader.fieldnames or []
        if "detail_images" not in fieldnames:
            raise SystemExit(f"Input CSV missing 'detail_images' column")

        rows_out = []
        for row in reader:
            cell = (row.get("detail_images") or "").strip()
            # find all image URLs in the cell
            matches = IMG_RE.findall(cell)
            if len(matches) != 1:
                continue
            rows_out.append(row)

    with output_path.open("w", encoding="utf-8-sig", newline="") as outf:
        writer = csv.DictWriter(outf, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows_out)

    return len(rows_out)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("input", nargs="?", help="input CSV path", default="./data_scripts/product_data.csv")
    p.add_argument("output", nargs="?", help="output CSV path", default="./data_scripts/filtered_product_data.csv")
    args = p.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    output_path = Path(args.output)
    count = filter_file(input_path, output_path)
    print(f"Wrote {count} rows to {output_path}")


if __name__ == "__main__":
    main()
