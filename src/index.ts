import joplin from 'api';
import { MenuItemLocation, ContentScriptType } from 'api/types';

interface UrlMetadata {
	url: string;
	title?: string;
	description?: string;
	host?: string;
	favicon?: string;
	image?: string;
}

// Validate if string is a valid URL
function isValidUrl(text: string): boolean {
	try {
		const url = new URL(text.trim());
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

// Extract content from meta tag
function extractMetaContent(html: string, patterns: string[]): string | undefined {
	for (const pattern of patterns) {
		const regex = new RegExp(pattern, 'i');
		const match = html.match(regex);
		if (match && match[1]) {
			return match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
		}
	}
	return undefined;
}

// Convert relative URL to absolute
function toAbsoluteUrl(relativeUrl: string, baseUrl: URL): string {
	if (relativeUrl.startsWith('//')) {
		return baseUrl.protocol + relativeUrl;
	} else if (relativeUrl.startsWith('/')) {
		return `${baseUrl.protocol}//${baseUrl.hostname}${relativeUrl}`;
	} else if (!relativeUrl.startsWith('http')) {
		return `${baseUrl.protocol}//${baseUrl.hostname}/${relativeUrl}`;
	}
	return relativeUrl;
}

// Fetch and parse URL metadata with timeout
async function fetchUrlMetadata(url: string): Promise<UrlMetadata | null> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			}
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			return null;
		}

		const html = await response.text();
		const urlObj = new URL(url);

		const metadata: UrlMetadata = {
			url: url
		};

		// Extract title (priority: og:title > twitter:title > <title>)
		metadata.title = extractMetaContent(html, [
			'<meta\\s+property="og:title"\\s+content="([^"]+)"',
			'<meta\\s+name="twitter:title"\\s+content="([^"]+)"',
			'<title>([^<]+)</title>'
		]);

		// Extract description (priority: og:description > twitter:description > meta description)
		metadata.description = extractMetaContent(html, [
			'<meta\\s+property="og:description"\\s+content="([^"]+)"',
			'<meta\\s+name="twitter:description"\\s+content="([^"]+)"',
			'<meta\\s+name="description"\\s+content="([^"]+)"'
		]);

		// Extract host
		metadata.host = urlObj.hostname;

		// Extract favicon
		const faviconRel = extractMetaContent(html, [
			'<link\\s+rel="icon"\\s+href="([^"]+)"',
			'<link\\s+rel="shortcut icon"\\s+href="([^"]+)"',
			'<link\\s+href="([^"]+)"\\s+rel="icon"',
			'<link\\s+href="([^"]+)"\\s+rel="shortcut icon"'
		]);

		if (faviconRel) {
			metadata.favicon = toAbsoluteUrl(faviconRel, urlObj);
		} else {
			metadata.favicon = `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
		}

		// Extract image (priority: og:image > twitter:image)
		const imageRel = extractMetaContent(html, [
			'<meta\\s+property="og:image"\\s+content="([^"]+)"',
			'<meta\\s+name="twitter:image"\\s+content="([^"]+)"',
			'<meta\\s+content="([^"]+)"\\s+property="og:image"',
			'<meta\\s+content="([^"]+)"\\s+name="twitter:image"'
		]);

		if (imageRel) {
			metadata.image = toAbsoluteUrl(imageRel, urlObj);
		}

		return metadata;

	} catch (error) {
		// eslint-disable-next-line no-console
		console.error('Error fetching URL metadata:', error);
		return null;
	}
}

// Format metadata for insertion
function formatMetadata(metadata: UrlMetadata): string {
	const lines: string[] = [];

	lines.push('```cardlink');
	lines.push(`url: ${metadata.url}`);

	if (metadata.title) {
		lines.push(`title: ${metadata.title}`);
	}

	if (metadata.description) {
		lines.push(`description: ${metadata.description}`);
	}

	if (metadata.host) {
		lines.push(`host: ${metadata.host}`);
	}

	if (metadata.favicon) {
		lines.push(`favicon: ${metadata.favicon}`);
	}

	if (metadata.image) {
		lines.push(`image: ${metadata.image}`);
	}

	lines.push('```');

	return lines.join('\n');
}

joplin.plugins.register({
	onStart: async function() {
		// eslint-disable-next-line no-console
		console.info('AutoCard plugin started!');

		// Register the cardlink content script for rendering
		await joplin.contentScripts.register(
			ContentScriptType.MarkdownItPlugin,
			'cardlink',
			'./cardlink.js'
		);

		// Register the command to insert clipboard URL with metadata at cursor
		await joplin.commands.register({
			name: 'insertClipboardUrl',
			label: 'Insert clipboard URL with metadata at cursor',
			iconName: 'fas fa-link',
			execute: async () => {
				try {
					// Read text from clipboard
					const clipboardText = await joplin.clipboard.readText();
					const trimmedText = clipboardText.trim();

					// Check if clipboard contains a valid URL
					if (!isValidUrl(trimmedText)) {
						// Not a URL, just insert as plain text
						await joplin.commands.execute('editor.execCommand', {
							name: 'replaceSelection',
							args: [clipboardText]
						});
						return;
					}

					// Try to fetch metadata
					const metadata = await fetchUrlMetadata(trimmedText);

					if (metadata) {
						// Successfully fetched metadata, insert formatted data
						const formattedText = formatMetadata(metadata);
						await joplin.commands.execute('editor.execCommand', {
							name: 'replaceSelection',
							args: [formattedText]
						});
					} else {
						// Failed to fetch metadata, show error and insert plain URL
						await joplin.views.dialogs.showMessageBox(
							'Failed to fetch metadata from URL. The URL will be inserted as plain text.'
						);
						await joplin.commands.execute('editor.execCommand', {
							name: 'replaceSelection',
							args: [clipboardText]
						});
					}
				} catch (error) {
					// eslint-disable-next-line no-console
					console.error('Error in insertClipboardUrl command:', error);
					// Fallback to simple paste
					const clipboardText = await joplin.clipboard.readText();
					await joplin.commands.execute('editor.execCommand', {
						name: 'replaceSelection',
						args: [clipboardText]
					});
				}
			}
		});

		// Register keyboard shortcut Ctrl+Shift+L (Cmd+Shift+L on Mac)
		await joplin.views.menuItems.create('insertClipboardUrlMenuItem', 'insertClipboardUrl', MenuItemLocation.Tools, { accelerator: 'Ctrl+Shift+L' });
	},
});