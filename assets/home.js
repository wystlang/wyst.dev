(() => {
	"use strict";

	const SCROLL_CUE_DISTANCE = 96;
	const SCROLL_CUE_STEPS = 8;
	const buttons = [...document.querySelectorAll("[data-copy-target]")];
	const sourcePanes = [
		...document.querySelectorAll(".source-viewport > pre"),
	];

	function updateSourceScrollCue(pane) {
		const viewport = pane.parentElement;
		if (!viewport) return;
		const hasOverflow = pane.scrollHeight > pane.clientHeight + 1;
		const opacity = hasOverflow
			? Math.max(0, 1 - pane.scrollTop / SCROLL_CUE_DISTANCE)
			: 0;
		viewport.dataset.scrollCue = String(
			Math.round(opacity * SCROLL_CUE_STEPS),
		);
	}

	if (sourcePanes.length) {
		const updateSourceScrollCues = () => {
			for (const pane of sourcePanes) updateSourceScrollCue(pane);
		};
		for (const pane of sourcePanes) {
			pane.addEventListener("scroll", () => updateSourceScrollCue(pane), {
				passive: true,
			});
		}
		window.addEventListener("resize", updateSourceScrollCues);
		window.addEventListener("load", updateSourceScrollCues, { once: true });
		updateSourceScrollCues();
	}

	function legacyCopy(text) {
		const buffer = document.createElement("textarea");
		buffer.value = text;
		buffer.setAttribute("aria-hidden", "true");
		buffer.setAttribute("data-clipboard-buffer", "");
		buffer.setAttribute("readonly", "");
		buffer.setAttribute("tabindex", "-1");
		document.body.append(buffer);
		buffer.select();
		buffer.setSelectionRange(0, buffer.value.length);

		let copied = false;
		try {
			copied =
				typeof document.execCommand === "function" &&
				document.execCommand("copy") === true;
		} finally {
			buffer.remove();
		}
		return copied;
	}

	function sourceText(target) {
		const alignedLines = new Map();
		for (const line of target.querySelectorAll(".block-comment-line")) {
			alignedLines.set(
				line.textContent,
				(alignedLines.get(line.textContent) ?? 0) + 1,
			);
		}

		return target.textContent
			.split("\n")
			.map((line) => {
				const remaining = alignedLines.get(line) ?? 0;
				if (!remaining) return line;
				alignedLines.set(line, remaining - 1);
				return ` ${line}`;
			})
			.join("\n");
	}

	async function copyText(text) {
		if (typeof navigator.clipboard?.writeText === "function") {
			try {
				await navigator.clipboard.writeText(text);
				return;
			} catch {
				// Older and file-based browsers may require the selection fallback.
			}
		}
		if (!legacyCopy(text)) throw new Error("clipboard write unavailable");
	}

	for (const button of buttons) {
		const target = document.getElementById(button.dataset.copyTarget ?? "");
		const status = document.getElementById(
			button.getAttribute("aria-describedby") ?? "",
		);
		if (!target) {
			button.disabled = true;
			continue;
		}

		const initialLabel = button.textContent.trim();
		let resetTimer;
		button.addEventListener("click", async () => {
			if (button.disabled) return;
			if (resetTimer) clearTimeout(resetTimer);

			button.disabled = true;
			button.dataset.copyState = "pending";
			button.textContent = "copying…";
			if (status) status.textContent = "Copying code.";
			try {
				await copyText(sourceText(target));
				button.textContent = "copied";
				button.dataset.copyState = "success";
				if (status) status.textContent = "Code copied to clipboard.";
			} catch {
				button.textContent = "retry";
				button.dataset.copyState = "error";
				if (status) status.textContent = "Could not copy code.";
			} finally {
				button.disabled = false;
				resetTimer = setTimeout(() => {
					button.textContent = initialLabel;
					delete button.dataset.copyState;
					if (status) status.textContent = "";
				}, 2_000);
			}
		});
	}
})();
