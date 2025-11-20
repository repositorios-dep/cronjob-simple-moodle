select 
	* 
from 
	dato_seguimiento
where 
	etapa_id in (
		select 
			id
		from 
			etapa 
		where
			tramite_id in (
				select 
					id
				from 
					tramite 
				where 
					proceso_id = (
						select 
							proceso_id 
						from 
							formulario 
						where 
							nombre like '%genero%' ) and 
					pendiente = 0))


select
    tramite.id as tramite, 
    dato_seguimiento.nombre as "key",
    dato_seguimiento.valor as "value"
FROM
    tramite
inner join 
    formulario
ON 
    tramite.proceso_id = formulario.proceso_id
inner join 
    etapa 
ON 
    etapa.tramite_id = tramite.id
inner join 
    dato_seguimiento
on 
    dato_seguimiento.etapa_id = etapa.id
where 
    formulario.nombre = 'Formulario de Inscripción Cursos de Género' and 
    tramite.pendiente = 0
order by
	tramite.id asc

select
    tramite.id as tramite, 
    dato_seguimiento.nombre as "key",
    dato_seguimiento.valor as "value"
FROM
    tramite
inner join 
    formulario
ON 
    tramite.proceso_id = formulario.proceso_id
inner join 
    etapa 
ON 
    etapa.tramite_id = tramite.id
inner join 
    dato_seguimiento
on 
    dato_seguimiento.etapa_id = etapa.id
where 
    formulario.nombre = 'Formulario de Inscripción Cursos de Género' and 
    tramite.pendiente = 0 and 
    tramite.id > 11476
order by
	tramite.id asc