const __VLS_props = defineProps();
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workspace-grid" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "panel workspace-panel agenda-workspace-panel" },
    'aria-labelledby': "appointments-list-title",
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
    href: "#i-calendar",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    id: "appointments-list-title",
});
(__VLS_ctx.filter === "day" ? "Citas del día" : "Todas las citas");
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-heading-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "workspace-count" },
});
(__VLS_ctx.selectedAppointments.length);
if (__VLS_ctx.canCreateAppointments) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.canCreateAppointments))
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "agenda-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "agenda-view-filters" },
    role: "group",
    'aria-label': "Filtrar citas",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('update:filter', 'day');
        } },
    ...{ class: "agenda-filter-button" },
    ...{ class: ({ 'agenda-filter-active': __VLS_ctx.filter === 'day' }) },
    type: "button",
    'aria-pressed': (__VLS_ctx.filter === 'day'),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('update:filter', 'all');
        } },
    ...{ class: "agenda-filter-button" },
    ...{ class: ({ 'agenda-filter-active': __VLS_ctx.filter === 'all' }) },
    type: "button",
    'aria-pressed': (__VLS_ctx.filter === 'all'),
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
    'aria-label': "Buscar cita",
    placeholder: "Buscar visitante, empresa o anfitrión...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "agenda-result-count" },
});
(__VLS_ctx.searchedAppointments.length);
(__VLS_ctx.searchedAppointments.length === 1 ? "resultado" : "resultados");
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-table-scroll" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
    ...{ class: "workspace-table agenda-table" },
    ...{ class: ({ 'agenda-table-readonly': !__VLS_ctx.canManageAppointments }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
for (const [appointment] of __VLS_getVForSourceType((__VLS_ctx.paginatedAppointments))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
        key: (appointment.id),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (appointment.time);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (appointment.visitor);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (appointment.company);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (appointment.host);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "status-pill" },
        ...{ class: (`status-${appointment.status.replace(' ', '-').toLowerCase()}`) },
    });
    (appointment.status);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "agenda-actions" },
        ...{ class: ({ 'agenda-actions-readonly': !__VLS_ctx.canManageAppointments }) },
    });
    if (__VLS_ctx.canManageAppointments && appointment.status !== 'Retirado' && appointment.status !== 'Cancelada') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageAppointments && appointment.status !== 'Retirado' && appointment.status !== 'Cancelada'))
                        return;
                    __VLS_ctx.emit('edit', appointment);
                } },
            ...{ class: "staff-edit-button" },
            type: "button",
        });
    }
    if (__VLS_ctx.canManageAppointments) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageAppointments))
                        return;
                    __VLS_ctx.emit('cancel', appointment);
                } },
            ...{ class: "workspace-remove" },
            type: "button",
            'aria-label': (`Cancelar cita de ${appointment.visitor}`),
            disabled: (appointment.status === 'Retirado' || appointment.status === 'Cancelada'),
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.emit('openQr', appointment);
            } },
        ...{ class: "qr-button" },
        type: "button",
        'aria-label': (`Ver QR de ${appointment.visitor}`),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-qr",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.canManageAppointments && appointment.partnerType === 'Contratista' && appointment.businessPartnerId && appointment.status !== 'Cancelada' && appointment.status !== 'Retirado') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageAppointments && appointment.partnerType === 'Contratista' && appointment.businessPartnerId && appointment.status !== 'Cancelada' && appointment.status !== 'Retirado'))
                        return;
                    __VLS_ctx.emit('sendCompanyQrs', appointment);
                } },
            ...{ class: "qr-button" },
            type: "button",
            'aria-label': (`Enviar QR al personal de ${appointment.company}`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "icon" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
            href: "#i-qr",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    if (__VLS_ctx.canManageAppointments) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageAppointments))
                        return;
                    __VLS_ctx.emit('delete', appointment);
                } },
            ...{ class: "workspace-remove agenda-delete-action" },
            type: "button",
            'aria-label': (`Eliminar cita de ${appointment.visitor}`),
            title: (appointment.status === 'Cancelada' ? 'Eliminar cita cancelada' : 'Primero cancela la cita para poder eliminarla'),
            disabled: (appointment.status !== 'Cancelada'),
        });
    }
}
if (__VLS_ctx.searchedAppointments.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "workspace-empty" },
        colspan: "6",
    });
    (__VLS_ctx.loading ? "Cargando citas..." : "No hay citas que coincidan con los filtros aplicados.");
}
if (__VLS_ctx.searchedAppointments.length > __VLS_ctx.appointmentsPerPage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
        ...{ class: "agenda-pagination" },
        'aria-label': "Paginación de citas",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    ((__VLS_ctx.appointmentsPage - 1) * __VLS_ctx.appointmentsPerPage + 1);
    (Math.min(__VLS_ctx.appointmentsPage * __VLS_ctx.appointmentsPerPage, __VLS_ctx.searchedAppointments.length));
    (__VLS_ctx.searchedAppointments.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.searchedAppointments.length > __VLS_ctx.appointmentsPerPage))
                    return;
                __VLS_ctx.emit('update:page', __VLS_ctx.appointmentsPage - 1);
            } },
        ...{ class: "pagination-button" },
        type: "button",
        disabled: (__VLS_ctx.appointmentsPage === 1),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "pagination-current" },
    });
    (__VLS_ctx.appointmentsPage);
    (__VLS_ctx.totalAppointmentPages);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.searchedAppointments.length > __VLS_ctx.appointmentsPerPage))
                    return;
                __VLS_ctx.emit('update:page', __VLS_ctx.appointmentsPage + 1);
            } },
        ...{ class: "pagination-button" },
        type: "button",
        disabled: (__VLS_ctx.appointmentsPage === __VLS_ctx.totalAppointmentPages),
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "appointment-calendar" },
    'aria-labelledby': "appointment-calendar-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "calendar-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    id: "appointment-calendar-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "calendar-month-controls" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('changeMonth', -1);
        } },
    ...{ class: "calendar-nav-button" },
    type: "button",
    'aria-label': "Mes anterior",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-chevron",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.calendarMonthLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('changeMonth', 1);
        } },
    ...{ class: "calendar-nav-button calendar-next" },
    type: "button",
    'aria-label': "Mes siguiente",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-chevron",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "calendar-grid" },
    role: "grid",
    'aria-labelledby': "appointment-calendar-title",
});
for (const [weekday] of __VLS_getVForSourceType((['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        key: (weekday),
        ...{ class: "calendar-weekday" },
        role: "columnheader",
    });
    (weekday);
}
for (const [day] of __VLS_getVForSourceType((__VLS_ctx.calendarDays))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.emit('selectDay', day.date);
            } },
        key: (day.date),
        ...{ class: "calendar-day" },
        ...{ class: ({
                'calendar-day-outside': !day.inMonth,
                'calendar-day-selected': __VLS_ctx.selectedAppointmentDate === day.date,
                'calendar-day-today': day.date === __VLS_ctx.today,
            }) },
        type: "button",
        role: "gridcell",
        'aria-label': (`${day.date}, ${day.appointments.length} citas`),
        'aria-pressed': (__VLS_ctx.selectedAppointmentDate === day.date),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "calendar-day-number" },
    });
    (day.day);
    for (const [appointment] of __VLS_getVForSourceType((day.appointments.slice(0, 2)))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            key: (appointment.id),
            ...{ class: "calendar-appointment" },
            title: (`${appointment.time} · ${appointment.visitor} · Anfitrión: ${appointment.host}`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.time, __VLS_intrinsicElements.time)({});
        (appointment.time);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (appointment.host);
        (appointment.visitor);
    }
    if (day.appointments.length > 2) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "calendar-more" },
        });
        (day.appointments.length - 2);
    }
}
/** @type {__VLS_StyleScopedClasses['workspace-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-workspace-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-heading-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-count']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-view-filters']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-filter-button']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-filter-active']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-filter-button']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-filter-active']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-search']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-result-count']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-table']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-table-readonly']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-actions-readonly']} */ ;
/** @type {__VLS_StyleScopedClasses['staff-edit-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-button']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-button']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-delete-action']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-button']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-current']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-button']} */ ;
/** @type {__VLS_StyleScopedClasses['appointment-calendar']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-month-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-next']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-weekday']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-day']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-day-outside']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-day-selected']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-day-today']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-day-number']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-appointment']} */ ;
/** @type {__VLS_StyleScopedClasses['calendar-more']} */ ;
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
