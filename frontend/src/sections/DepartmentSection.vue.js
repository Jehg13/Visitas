import { computed } from "vue";
const props = defineProps();
const departmentsWithHostCounts = computed(() => props.departments.map((department) => ({
    ...department,
    hostCount: props.hosts.filter((host) => host.departmentId === department.id).length,
})));
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workspace-grid department-workspace" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "panel workspace-panel department-panel" },
    'aria-labelledby': "departments-title",
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
    href: "#i-organization",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    id: "departments-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-heading-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "workspace-count" },
});
(__VLS_ctx.departments.length);
(__VLS_ctx.departments.length === 1 ? "departamento" : "departamentos");
if (__VLS_ctx.isAdmin) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isAdmin))
                    return;
                __VLS_ctx.emit('create');
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
}
if (__VLS_ctx.departmentsWithHostCounts.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "department-card-grid" },
    });
    for (const [department] of __VLS_getVForSourceType((__VLS_ctx.departmentsWithHostCounts))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (department.id),
            ...{ class: "department-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "department-card-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "department-card-icon" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "icon" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
            href: "#i-organization",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "department-card-count" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (department.hostCount);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (department.hostCount === 1 ? "anfitrión vinculado" : "anfitriones vinculados");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        (department.name);
        if (__VLS_ctx.isAdmin) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "department-card-actions" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.departmentsWithHostCounts.length))
                            return;
                        if (!(__VLS_ctx.isAdmin))
                            return;
                        __VLS_ctx.emit('edit', department);
                    } },
                ...{ class: "staff-edit-button" },
                type: "button",
                'aria-label': (`Editar departamento ${department.name}`),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.departmentsWithHostCounts.length))
                            return;
                        if (!(__VLS_ctx.isAdmin))
                            return;
                        __VLS_ctx.emit('remove', department.id);
                    } },
                ...{ class: "workspace-remove" },
                type: "button",
                'aria-label': (`Eliminar departamento ${department.name}`),
            });
        }
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "department-empty-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "department-card-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-organization",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
/** @type {__VLS_StyleScopedClasses['workspace-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['department-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['department-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-heading-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-count']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['department-card-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['department-card']} */ ;
/** @type {__VLS_StyleScopedClasses['department-card-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['department-card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['department-card-count']} */ ;
/** @type {__VLS_StyleScopedClasses['department-card-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['staff-edit-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['department-empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['department-card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            departmentsWithHostCounts: departmentsWithHostCounts,
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
