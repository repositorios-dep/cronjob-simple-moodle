import mysql from "mysql2/promise";
import crypto from "crypto";
import puppeteer, { ElementHandle } from "puppeteer";
import { setTimeout } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";

async function startLocalDB() {
	db.exec(`
    CREATE TABLE IF NOT EXISTS ultimo_registro (id_tramite INTEGER);
  `);
}

const KEYS_IMPORTANTES = [
	"rut",
	"nombre",
	"apellido",
	"email",
	"servicio_publico",
	"curso_de_genero",
];

const NOMBRE_FORMULARIO = "Formulario de Inscripción Curso Básico de Género";

function buildQuery(maxTramite = Number.NEGATIVE_INFINITY) {
	let query = `
select
    tramite.id as tramite, 
    dato_seguimiento.nombre as "key",
    dato_seguimiento.valor as "value",
    etapa.usuario_id as "usuario"
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
    formulario.nombre = '${NOMBRE_FORMULARIO}' and 
    tramite.pendiente = 0  ${
		maxTramite !== Number.NEGATIVE_INFINITY && !isNaN(maxTramite)
			? `and\n    tramite.id > ${maxTramite}`
			: ""
	}
order by
    tramite.id asc
`;
	return query;
}

async function fetchData(query = "") {
	if (query === "") return [];

	// Create the connection to database
	const connection = await mysql.createConnection({
		host: process.env.SIMPLE_BD_HOST,
		port: process.env.SIMPLE_BD_PORT,
		user: process.env.SIMPLE_BD_USER,
		password: process.env.SIMPLE_BD_PASSWORD,
		database: process.env.SIMPLE_BD_SCHEMA,
	});

	try {
		const [results] = await connection.query(query);
		connection.close();
		return results;
	} catch (err) {
		console.log(err);
	}
}

function mapData(data = []) {
	const map = {};
	for (const element of data) {
		const key = element.usuario;

		if (!map[key]) {
			map[key] = {};
			map[key][element.key] = JSON.parse(element.value);
			continue;
		}

		if (!KEYS_IMPORTANTES.includes(element.key)) continue;
		if (element.key === "curso_de_genero" && !map[key]["curso_de_genero"]) {
			map[key]["curso_de_genero"] = new Set();
			const arr = JSON.parse(element.value);
			for (const el of arr) {
				map[key]["curso_de_genero"].add(el);
			}
			//aqui ignorar campos nuevos

			continue;
		}

		if (
			element.key === "curso_de_genero" &&
			map[key]?.curso_de_genero.size > 0
		) {
			const arr = JSON.parse(element.value);
			for (const el of arr) {
				map[key]["curso_de_genero"].add(el);
			}
			continue;
		}

		map[key][element.key] = JSON.parse(element.value);
	}

	return map;
}

function transformToCSV(map = {}) {
	let header = "username,password,firstname,lastname,email,institution";

	let maxCourseQuantity = Number.NEGATIVE_INFINITY;

	for (const item in map) {
		if (map[item].curso_de_genero.size > maxCourseQuantity)
			maxCourseQuantity = map[item].curso_de_genero.size;
	}
	let additionalHeaders = [];
	for (let i = 1; i <= maxCourseQuantity; i++) {
		additionalHeaders.push("course" + i);
	}
	header += "," + additionalHeaders.join(",");
	let body = "";
	for (const item in map) {
		const randPass = crypto
			.randomBytes(15)
			.toString("base64")
			.replace(/[^a-zA-Z0-9@//<>"'~^]/g, "");
		body += `\n${map[item].rut},${randPass},${map[item].nombre},${map[item].apellido},${map[item].email},${map[item].servicio_publico}`;
		const setToArr = [...map[item].curso_de_genero];
		for (let i = 0; i < maxCourseQuantity; i++) {
			if (!setToArr[i]) {
				body += ",";
			} else {
				body += `,${setToArr[i]}`;
			}
		}
	}

	return header + body;
}

async function uploadCSV(csv = "") {
	if (!csv) return;
	const MIN_WAIT_TIME = 5 * 1000;
	const browser = await puppeteer.launch({ headless: false });
	const page = await browser.newPage();

	// Navigate the page to a URL.
	await page.goto(process.env.MOODLE_LOGIN_URL);

	// Set screen size.
	await page.setViewport({ width: 1080, height: 1024 });

	// Open the search menu using the keyboard.
	await page.keyboard.press("/");

	// Type into search box using accessible input name.
	await page
		.locator("input[type='text'][name='username']")
		.fill(process.env.MOODLE_ADMIN_USER);

	await page
		.locator("input[type='password'][name='password']")
		.fill(process.env.MOODLE_ADMIN_PASSWORD);

	await page.locator("button[type='submit']").click();

	await setTimeout(MIN_WAIT_TIME);

	await page.goto(process.env.MOODLE_USER_UPLOAD_URL);

	await setTimeout(MIN_WAIT_TIME);

	const dropzone = await page.waitForSelector(
		"div.mdl-left.filepicker-filelist"
	);

	const file = {
		name: "usuarios.csv",
		mimeType: "text/csv",
		buffer: Buffer.from(csv, "utf8"),
	};

	const dataTransfer = await page.evaluateHandle((fileData) => {
		const uint8 = new Uint8Array(fileData.buffer.data);
		const dt = new DataTransfer();
		const newFile = new File([uint8], fileData.name, {
			type: fileData.mimeType,
		});
		dt.items.add(newFile);
		return dt;
	}, file);

	await dropzone.evaluate((element, dt) => {
		element.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt }));
		element.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt }));
		element.dispatchEvent(new DragEvent("drop", { dataTransfer: dt }));
	}, dataTransfer);

	await page.locator("input[type='submit']").click();
	await setTimeout(MIN_WAIT_TIME);
	await page.select("form[method=post].mform select[name=uutype]", "2");
	await page.select(
		"form[method=post].mform select[name=uustandardusernames]",
		"1"
	);
	await page.select("form[method=post].mform select[name=maildisplay]", "0");
	await page.locator("input[type=submit]").click();
	await browser.close();
}

const db = new DatabaseSync("registro_ultimo_tramite_procesado.sqlite");
startLocalDB(db);
const KNOWN_MAX_TRAMITE = db.prepare(`SELECT id_tramite FROM ultimo_registro`).get();

const databaseData = await fetchData(buildQuery(KNOWN_MAX_TRAMITE?.id_tramite));
const csv = transformToCSV(mapData(databaseData));
if (csv.split("\n").length === 1) {
	throw new Error("El CSV no contiene datos");
}

let maxTramite = Number.NEGATIVE_INFINITY;
for (const item of databaseData) {
	if (item.tramite > maxTramite) maxTramite = item.tramite;
}

await uploadCSV(csv);

if (!KNOWN_MAX_TRAMITE)
	db.prepare("INSERT INTO ultimo_registro (id_tramite) VALUES(?)").run(
		maxTramite
	);
else
	db.prepare(
		"UPDATE ultimo_registro SET id_tramite = ? where id_tramite = ?"
	).run(maxTramite, KNOWN_MAX_TRAMITE.id_tramite);