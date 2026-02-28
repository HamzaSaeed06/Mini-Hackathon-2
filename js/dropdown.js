export function initCustomSelect(containerId, optionsListId, originalSelectId, optionsData, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const trigger = container.querySelector('.custom-select-trigger');
    const triggerText = trigger.querySelector('span');
    const optionsList = document.getElementById(optionsListId);
    const originalSelect = document.getElementById(originalSelectId);
    const searchInput = container.querySelector('.custom-select-search input');

    // Toggle dropdown
    trigger.onclick = (e) => {
        e.stopPropagation();
        closeAllDropdowns(container);
        container.classList.toggle('active');
        if (container.classList.contains('active') && searchInput) {
            searchInput.focus();
        }
    };

    // Close on click outside
    document.addEventListener('click', () => {
        container.classList.remove('active');
    });

    container.onclick = (e) => e.stopPropagation();

    // Populate options
    function renderOptions(data) {
        optionsList.innerHTML = '';
        data.forEach(item => {
            const initial = (item.name || '?')[0].toUpperCase();
            const option = document.createElement('div');
            option.className = 'custom-option';
            if (originalSelect.value === item.id) option.classList.add('selected');

            option.innerHTML = `
                <div class="custom-option-avatar">${initial}</div>
                <div class="custom-option-info">
                    <span class="custom-option-name">${item.name}</span>
                    <span class="custom-option-sub">${item.sub || ''}</span>
                </div>
            `;

            option.onclick = () => {
                selectOption(item);
                container.classList.remove('active');
            };

            optionsList.appendChild(option);
        });
    }

    function selectOption(item) {
        // Update triggering UI
        triggerText.textContent = item.name;

        // Update original select (important for form submission logic)
        originalSelect.innerHTML = `<option value="${item.id}" selected data-name="${item.name}">${item.name}</option>`;

        // Add extra data attributes if they exist
        if (item.extra) {
            const opt = originalSelect.querySelector('option');
            Object.keys(item.extra).forEach(key => {
                opt.dataset[key] = item.extra[key];
            });
        }

        // Trigger change event just in case
        originalSelect.dispatchEvent(new Event('change'));

        // Highlight selected in list
        optionsList.querySelectorAll('.custom-option').forEach(opt => {
            opt.classList.remove('selected');
            if (opt.querySelector('.custom-option-name').textContent === item.name) {
                opt.classList.add('selected');
            }
        });

        if (onSelect) onSelect(item);
    }

    renderOptions(optionsData);

    // Search logic
    if (searchInput) {
        searchInput.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = optionsData.filter(item =>
                item.name.toLowerCase().includes(term) ||
                (item.sub && item.sub.toLowerCase().includes(term))
            );
            renderOptions(filtered);
        };
    }
}

function closeAllDropdowns(except) {
    document.querySelectorAll('.custom-select-container').forEach(c => {
        if (c !== except) c.classList.remove('active');
    });
}
