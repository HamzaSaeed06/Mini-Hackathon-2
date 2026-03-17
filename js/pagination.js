/**
 * renderPagination – renders a numbered pagination UI into a container using safe DOM elements.
 * 
 * @param {HTMLElement} container   – the .pagination-controls div
 * @param {number}      currentPage – 1-indexed current page
 * @param {number}      totalPages  – total number of pages
 * @param {Function}    onPageChange – callback(newPage: number)
 */
export function renderPagination(container, currentPage, totalPages, onPageChange) {
    if (!container) return;

    if (totalPages <= 1) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = ''; // clear out

    const pages = getPageNumbers(currentPage, totalPages);

    // Prev Button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pg-btn arrow';
    prevBtn.innerHTML = '<i data-lucide="chevron-left"></i>';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => onPageChange(currentPage - 1);
    container.appendChild(prevBtn);

    // Numbered Pages / Ellipsis
    pages.forEach(p => {
        const btn = document.createElement('button');
        if (p === '...') {
            btn.className = 'pg-btn ellipsis';
            btn.innerHTML = '<span></span><span></span><span></span>';
            btn.disabled = true;
        } else {
            btn.className = `pg-btn ${p === currentPage ? 'active' : ''}`;
            btn.textContent = p;
            btn.onclick = () => onPageChange(p);
        }
        container.appendChild(btn);
    });

    // Next Button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pg-btn arrow';
    nextBtn.innerHTML = '<i data-lucide="chevron-right"></i>';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => onPageChange(currentPage + 1);
    container.appendChild(nextBtn);

    if (window.lucide) lucide.createIcons();
}

/**
 * Generates an array of page numbers (with ellipsis '...') for display.
 */
function getPageNumbers(current, total) {
    if (total <= 4) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }

    if (current <= 3) {
        return [1, 2, 3, '...', total];
    } else if (current >= total - 2) {
        return [1, '...', total - 2, total - 1, total];
    } else {
        return [1, '...', current, '...', total];
    }
}

