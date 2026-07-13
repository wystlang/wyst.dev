(() => {
	"use strict";

	const toggle = document.querySelector(".doc-sidebar-toggle");
	if (!toggle) return;

	const controlledId = toggle.getAttribute("aria-controls");
	const sidebar = controlledId && document.getElementById(controlledId);
	if (!sidebar) return;

	const setOpen = (open) => {
		toggle.setAttribute("aria-expanded", String(open));
		sidebar.classList.toggle("is-open", open);
	};

	setOpen(false);
	toggle.addEventListener("click", () => {
		setOpen(toggle.getAttribute("aria-expanded") !== "true");
	});

	document.addEventListener("keydown", (event) => {
		if (
			event.key === "Escape" &&
			toggle.getAttribute("aria-expanded") === "true"
		) {
			setOpen(false);
			toggle.focus();
		}
	});
})();
