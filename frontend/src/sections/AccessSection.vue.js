import AccessAccountsSection from "./AccessAccountsSection.vue";
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
    ...{ class: "panel workspace-panel directory-panel access-panel" },
    'aria-labelledby': "access-title",
});
/** @type {[typeof AccessAccountsSection, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(AccessAccountsSection, new AccessAccountsSection({
    ...{ 'onUpdate:search': {} },
    ...{ 'onEdit': {} },
    search: (__VLS_ctx.search),
    accounts: (__VLS_ctx.accounts),
    isAdmin: (__VLS_ctx.isAdmin),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:search': {} },
    ...{ 'onEdit': {} },
    search: (__VLS_ctx.search),
    accounts: (__VLS_ctx.accounts),
    isAdmin: (__VLS_ctx.isAdmin),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    'onUpdate:search': (...[$event]) => {
        __VLS_ctx.emit('update:search', $event);
    }
};
const __VLS_7 = {
    onEdit: (...[$event]) => {
        __VLS_ctx.emit('editAccount', $event);
    }
};
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['workspace-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['access-panel']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            AccessAccountsSection: AccessAccountsSection,
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
