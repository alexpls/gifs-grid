dev:
	watchexec -r "go run ."

deploy:
	rsync -av --delete --exclude=".*/" . alex@fed.lan:/opt/gifs/
	ssh alex@fed.lan "cd /opt/gifs && go build -o gifs-server . && sudo systemctl restart gifs.service"

[working-directory: 'gifs']
gifs_clean:
	uv run python find_duplicate_gifs.py
	uv run python find_naughty_gifs.py
