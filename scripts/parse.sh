#!/bin/bash

# This script processes a CSV file containing URLs and Ranks in the first two columns.
# It extracts the unique base domain (SLD.TLD), preserves the rank, and maintains
# the original order of the first appearance of each unique domain.
#
# FILTERING LOGIC:
# 1. Keeps domains with exactly 1 dot (e.g., 'domain.com').
# 2. Keeps domains with exactly 2 dots ONLY IF they begin with 'www.' (e.g., 'www.domain.com').
# 3. Rejects all other subdomains, including 'sub.domain.com' and 'a.b.c.domain.com'.
#
# Usage: ./extract_domains.sh <input_file.csv> > output.csv
# Example: ./extract_domains.sh domains.csv > filtered_domains.csv

INPUT_FILE="${1:-domains.csv}"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found."
    echo "Usage: $0 <input_file.csv>"
    exit 1
fi

echo "--- Unique Filtered Base Domains (Ordered, with Rank) ---"
echo "domain,rank" # Print the header for the new CSV output

# The core command explained:
# 1. awk -F, 'NR > 1 {print $1 "|" $2}' "$INPUT_FILE"
#    - Skips the header and extracts the URL ($1) and Rank ($2), separated by a pipe (|).
# 2. sed 's|.*://||; s|/.*||'
#    - Cleans the URL: removes the protocol and any path/query.
# 3. awk -F'|' '...'
#    - This final block filters, extracts the base domain (SLD.TLD), checks for uniqueness,
#      and prints the result in the original file order.

awk -F, 'NR > 1 {print $1 "|" $2}' "$INPUT_FILE" | \
sed 's|.*://||; s|/.*||' | \
awk -F'|' '
    {
        DOMAIN = $1;
        RANK = $2;

        # 1. Filtering Check: Keep only domains matching the strict length rules
        # Use split() to count the dot-separated parts (dots)
        dots = split(DOMAIN, a, ".");

        is_two_part = (dots == 2);
        is_www_three_part = (dots == 3 && DOMAIN ~ /^www\./);

        if (is_two_part || is_www_three_part) {
            # 2. Extraction: Get the SLD.TLD for the uniqueness check key
            # We use the last two array parts (a[dots-1].a[dots]) to get 'google.com' from 'www.google.com'
            base_domain = a[dots - 1] "." a[dots];

            # 3. Uniqueness Check (Preserving first occurrence order)
            # The 'seen' array tracks whether we have already found a unique base_domain.
            if (!(base_domain in seen)) {
                # Mark base domain (e.g., 'discord.com') as seen
                seen[base_domain] = 1;

                # 4. Print in CSV format:
                # We print the full filtered DOMAIN (e.g., www.discord.com or discord.com)
                # which ensures the www. prefix is kept at the beginning, as requested.
                print DOMAIN "," RANK;
            }
        }
    }
'

echo "----------------------------------------------------------"
