const __VLS_props = defineProps();
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workspace-grid directory-workspace" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "panel workspace-panel directory-panel" },
    'aria-labelledby': "business-partners-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "panel-heading workspace-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-building",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    id: "business-partners-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-heading-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "workspace-count" },
});
(__VLS_ctx.filteredBusinessPartners.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('createPartner');
        } },
    ...{ class: "button-primary" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-plus",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "directory-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "agenda-search" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-search",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "sr-only" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onInput: (...[$event]) => {
            __VLS_ctx.emit('update:businessPartnerSearch', $event.target.value);
        } },
    value: (__VLS_ctx.businessPartnerSearch),
    type: "search",
    'aria-label': "Buscar contratistas, proveedores y visitantes",
    placeholder: "Buscar por nombre, RFC, categoría, descripción o asunto...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "directory-filter" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
    ...{ onChange: (...[$event]) => {
            __VLS_ctx.emit('update:businessPartnerTypeFilter', $event.target.value);
        } },
    value: (__VLS_ctx.businessPartnerTypeFilter),
    'aria-label': "Filtrar registros por tipo",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Todas",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Contratista",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Proveedor",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Visitante",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "directory-filter" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
    ...{ onChange: (...[$event]) => {
            __VLS_ctx.emit('update:businessPartnerCategoryFilter', $event.target.value);
        } },
    value: (__VLS_ctx.businessPartnerCategoryFilter),
    'aria-label': "Filtrar registros por categoría",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Todas",
});
for (const [category] of __VLS_getVForSourceType((__VLS_ctx.businessPartnerCategories))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        key: (category),
        value: (category),
    });
    (category);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "directory-filter" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
    ...{ onChange: (...[$event]) => {
            __VLS_ctx.emit('update:businessPartnerStatusFilter', $event.target.value);
        } },
    value: (__VLS_ctx.businessPartnerStatusFilter),
    'aria-label': "Filtrar registros por estado",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Todas",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Activa",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Inactiva",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "No aplica",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-table-scroll business-directory-table-scroll" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
    ...{ class: "workspace-table business-partner-table" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
for (const [partner] of __VLS_getVForSourceType((__VLS_ctx.paginatedBusinessPartners))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
        key: (partner.id),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (partner.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (partner.type);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "business-partner-description" },
        title: (partner.description || undefined),
    });
    (partner.description || "—");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (partner.rfc);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (partner.category);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (partner.type === "Visitante" ? partner.subject || "—" : "—");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (partner.employeeCount);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "partner-status-pill" },
        ...{ class: (partner.status === 'No aplica' ? '' : `partner-status-${partner.status.toLowerCase()}`) },
    });
    (partner.status);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "staff-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.emit('editPartner', partner);
            } },
        ...{ class: "staff-edit-button" },
        type: "button",
        disabled: (__VLS_ctx.businessPartnerSaving || __VLS_ctx.loading),
        'aria-label': (`Editar ${partner.name}`),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.emit('removePartner', partner.id);
            } },
        ...{ class: "workspace-remove" },
        type: "button",
        disabled: (__VLS_ctx.businessPartnerSaving || __VLS_ctx.loading),
        'aria-label': (`Eliminar ${partner.name}`),
    });
}
if (__VLS_ctx.filteredBusinessPartners.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "workspace-empty" },
        colspan: "8",
    });
    (__VLS_ctx.loading ? "Cargando registros..." : __VLS_ctx.businessPartners.length === 0 ? "Aún no hay contratistas, proveedores o visitantes registrados." : "No hay registros que coincidan con los filtros.");
}
if (__VLS_ctx.filteredBusinessPartners.length > __VLS_ctx.partnerRowsPerPage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
        ...{ class: "directory-pagination" },
        'aria-label': "Paginación del directorio",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    ((__VLS_ctx.businessPartnerPage - 1) * __VLS_ctx.partnerRowsPerPage + 1);
    (Math.min(__VLS_ctx.businessPartnerPage * __VLS_ctx.partnerRowsPerPage, __VLS_ctx.filteredBusinessPartners.length));
    (__VLS_ctx.filteredBusinessPartners.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.filteredBusinessPartners.length > __VLS_ctx.partnerRowsPerPage))
                    return;
                __VLS_ctx.emit('update:businessPartnerPage', __VLS_ctx.businessPartnerPage - 1);
            } },
        ...{ class: "pagination-button" },
        type: "button",
        disabled: (__VLS_ctx.businessPartnerPage === 1),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "pagination-current" },
    });
    (__VLS_ctx.businessPartnerPage);
    (__VLS_ctx.businessPartnerPages);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.filteredBusinessPartners.length > __VLS_ctx.partnerRowsPerPage))
                    return;
                __VLS_ctx.emit('update:businessPartnerPage', __VLS_ctx.businessPartnerPage + 1);
            } },
        ...{ class: "pagination-button" },
        type: "button",
        disabled: (__VLS_ctx.businessPartnerPage === __VLS_ctx.businessPartnerPages),
    });
}
/** @type {__VLS_StyleScopedClasses['workspace-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-heading-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-count']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-search']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['business-directory-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['business-partner-table']} */ ;
/** @type {__VLS_StyleScopedClasses['business-partner-description']} */ ;
/** @type {__VLS_StyleScopedClasses['partner-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['staff-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['staff-edit-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-button']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-current']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-button']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
