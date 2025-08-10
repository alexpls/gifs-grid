#!/bin/bash

GIFCITIES_DIR="gifs"
mkdir -p "$GIFCITIES_DIR"

KEYWORDS=(
    "dancing"
    "music"
    "cat"
    "flames"
    "sparkles"
    "construction"
    "animated"
    "spinning"
    "blink"
    "neon"
    "matrix"
    "cyberpunk"
    "geocities"
    "webring"
    "visitor_counter"
    "mailbox"
    "guestbook"
    "new"
    "cool"
    "awesome"
    "welcome"
    "animal"
    "party"
    "fun"
)

download_gifs_for_keyword() {
    local keyword="$1"
    
    echo "Processing keyword: $keyword"
    
    local api_url="https://gifcities.archive.org/api/v1/gifsearch?q=$keyword"
    
    while true; do
        local response=$(curl -s "$api_url")
        local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$api_url")
        
        if [ "$http_code" = "429" ]; then
            echo "Rate limited. Sleeping for 10 seconds..."
            sleep 10
            continue
        elif [ "$http_code" = "200" ]; then
            break
        else
            echo "HTTP error $http_code. Sleeping for 10 seconds..."
            sleep 10
            continue
        fi
    done
    
    response=$(echo "$response" | jq -r '.[] | @base64')
    
    if [ -z "$response" ]; then
        echo "No results found for keyword: $keyword"
        return
    fi
    
    local count=0
    
    while IFS= read -r encoded_result; do
        local result=$(echo "$encoded_result" | base64 -d)
        local gif_path=$(echo "$result" | jq -r '.gif')
        local checksum=$(echo "$result" | jq -r '.checksum')
        local url_text=$(echo "$result" | jq -r '.url_text')
        
        if [ "$gif_path" != "null" ] && [ "$checksum" != "null" ]; then
            local gif_url="https://web.archive.org/web/$gif_path"
            
            local safe_name=$(echo "$url_text" | tr ' /' '_' | tr -cd '[:alnum:]._-' | cut -c1-50)
            local filename="${checksum:0:8}_${safe_name}.gif"
            local filepath="$GIFCITIES_DIR/$filename"
            
            if [ ! -f "$filepath" ]; then
                echo "  Downloading: $filename"
                
                while true; do
                    if curl -s -L --max-time 30 "$gif_url" -o "$filepath"; then
                        if [ -s "$filepath" ] && file "$filepath" | grep -q "GIF"; then
                            echo "    Downloaded successfully"
                            ((count++))
                            break
                        else
                            echo "    Invalid or empty file, removing"
                            rm -f "$filepath"
                            break
                        fi
                    else
                        local download_http_code=$(curl -s -L --max-time 30 -w "%{http_code}" -o /dev/null "$gif_url")
                        if [ "$download_http_code" = "429" ]; then
                            echo "    Rate limited on download. Sleeping for 10 seconds..."
                            sleep 10
                            continue
                        else
                            echo "    Download failed"
                            rm -f "$filepath"
                            break
                        fi
                    fi
                done
            else
                echo "  Skipping: $filename (already exists)"
                ((count++))
            fi
            
            sleep 2 # take it easy downloading from archive.org
        fi
    done <<< "$response"
    
    echo "Downloaded $count GIFs for keyword: $keyword"
    echo
}

total_keywords=${#KEYWORDS[@]}
current=0

for keyword in "${KEYWORDS[@]}"; do
    ((current++))
    echo "Progress: $current/$total_keywords"
    download_gifs_for_keyword "$keyword"
done

echo "Done!"

