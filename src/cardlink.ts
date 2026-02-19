module.exports = {
	default: function(context) {
		return {
			plugin: function(markdownIt, _options) {
				const defaultRender = markdownIt.renderer.rules.fence || function(tokens, idx, options, env, self) {
					return self.renderToken(tokens, idx, options);
				};

				markdownIt.renderer.rules.fence = function(tokens, idx, options, env, self) {
					const token = tokens[idx];
					const info = token.info ? token.info.trim() : '';

					if (info === 'cardlink') {
						const content = token.content;
						const lines = content.split('\n');
						const metadata: { [key: string]: string } = {};

						// Parse the cardlink content
						for (const line of lines) {
							const colonIndex = line.indexOf(':');
							if (colonIndex > 0) {
								const key = line.substring(0, colonIndex).trim();
								const value = line.substring(colonIndex + 1).trim();
								metadata[key] = value;
							}
						}

						const url = metadata['url'] || '';
						const title = metadata['title'] || '';
						const description = metadata['description'] || '';
						const host = metadata['host'] || '';
						const favicon = metadata['favicon'] || '';
						const image = metadata['image'] || '';

						// Generate HTML for the card
						let html = '<div class="cardlink-container">';
						html += `<a href="${url}" target="_blank" rel="noopener noreferrer" class="cardlink-card">`;

						// Left side - Image
						if (image) {
							html += '<div class="cardlink-image">';
							html += `<img src="${image}" alt="${title}" />`;
							html += '</div>';
						}

						// Right side - Content
						html += '<div class="cardlink-content">';

						if (title) {
							html += `<div class="cardlink-title">${title}</div>`;
						}

						if (description) {
							html += `<div class="cardlink-description">${description}</div>`;
						}

						if (host || favicon) {
							html += '<div class="cardlink-footer">';
							if (favicon) {
								html += `<img src="${favicon}" alt="" class="cardlink-favicon" />`;
							}
							if (host) {
								html += `<span class="cardlink-host">${host}</span>`;
							}
							html += '</div>';
						}

						html += '</div>'; // close cardlink-content
						html += '</a>'; // close cardlink-card
						html += '</div>'; // close cardlink-container

						return html;
					}

					return defaultRender(tokens, idx, options, env, self);
				};
			},
			assets: function() {
				return [
					{ name: 'cardlink.css' }
				];
			}
		};
	}
};