dev:
	watchexec -r "go run ."

deploy:
	# hyperscale
	rsync -av --delete --exclude=".*/" . alex@192.168.1.87:/opt/gifs/
	ssh alex@192.168.1.87 "cd /opt/gifs && go build -o gifs-server . && sudo systemctl restart gifs.service"

[working-directory: 'gifs']
gifs_clean:
	uv run python find_duplicate_gifs.py
	uv run python find_naughty_gifs.py
