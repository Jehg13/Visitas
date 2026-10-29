import { computed } from "vue";
const props = defineProps();
const emit = defineEmits();
const filteredAccounts = computed(() => {
    const query = props.search.trim().toLocaleLowerCase();
    if (!query)
        return props.accounts;
    return props.accounts.filter((account) => [
        account.login,
        account.name ?? "",
        account.email ?? "",
        account.role ?? "",
        account.phone ?? "",
        account.sectionAccess.includes("administrador")
            ? "administrador"
            : account.sectionAccess.includes("recepcion")
                ? "recepción"
                : "sin acceso",
    ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query));
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
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
    href: "#i-shield",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    id: "access-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-heading-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "workspace-count" },
});
(__VLS_ctx.accounts.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "access-intro" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "external-staff-toolbar" },
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
            __VLS_ctx.emit('update:search', $event.target.value);
        } },
    value: (__VLS_ctx.search),
    type: "search",
    'aria-label': "Buscar cuentas",
    placeholder: "Buscar por usuario, nombre, puesto o correo...",
});
if (__VLS_ctx.accounts.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-table-scroll" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
        ...{ class: "workspace-table access-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.caption, __VLS_intrinsicElements.caption)({
        ...{ class: "workspace-table-caption access-table-caption" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "access-table-caption-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "access-table-caption-count" },
    });
    (__VLS_ctx.filteredAccounts.length);
    (__VLS_ctx.accounts.length);
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sr-only" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    for (const [account] of __VLS_getVForSourceType((__VLS_ctx.filteredAccounts))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            key: (account.login),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "host-identity" },
        });
        if (account.picture) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                ...{ class: "host-picture-avatar" },
                src: (account.picture),
                alt: "",
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "host-picture-avatar host-picture-placeholder" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                ...{ class: "icon" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
                href: "#i-user",
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (account.login);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (account.name || "—");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (account.role || "—");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (account.email || "—");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (account.phone || "—");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "partner-status-pill" },
            ...{ class: (['Y', '1'].includes(account.active ?? '') ? 'partner-status-activa' : 'partner-status-inactiva') },
        });
        (["Y", "1"].includes(account.active ?? "") ? "Activa" : "Inactiva");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "host-state-pills" },
        });
        if (account.sectionAccess.includes('administrador')) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "access-role-pill access-role-admin" },
            });
        }
        else if (account.sectionAccess.includes('recepcion')) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "access-role-pill access-role-reception" },
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "access-role-pill access-role-none" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        if (__VLS_ctx.isAdmin) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.accounts.length > 0))
                            return;
                        if (!(__VLS_ctx.isAdmin))
                            return;
                        __VLS_ctx.emit('edit', account);
                    } },
                ...{ class: "staff-edit-button" },
                type: "button",
                'aria-label': (`Editar control de acceso de ${account.login}`),
            });
        }
    }
    if (__VLS_ctx.filteredAccounts.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "workspace-empty" },
            colspan: "8",
        });
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "workspace-hint" },
    });
}
/** @type {__VLS_StyleScopedClasses['panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-heading-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-count']} */ ;
/** @type {__VLS_StyleScopedClasses['access-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['external-staff-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-search']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['access-table']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['access-table-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['access-table-caption-title']} */ ;
/** @type {__VLS_StyleScopedClasses['access-table-caption-count']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['host-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['host-picture-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['host-picture-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['host-picture-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['partner-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['host-state-pills']} */ ;
/** @type {__VLS_StyleScopedClasses['access-role-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['access-role-admin']} */ ;
/** @type {__VLS_StyleScopedClasses['access-role-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['access-role-reception']} */ ;
/** @type {__VLS_StyleScopedClasses['access-role-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['access-role-none']} */ ;
/** @type {__VLS_StyleScopedClasses['staff-edit-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-hint']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            filteredAccounts: filteredAccounts,
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
