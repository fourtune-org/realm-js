import {initializeObjectCreation} from "./lib/init/_generic/initializeObjectCreation.mjs"
import {autogenerateTSConfigFiles} from "./lib/init/_generic/autogenerateTSConfigFiles.mjs"
import {initializeGenericProject} from "./lib/init/_generic/initializeGenericProject.mjs"
import {preInitializeGenericProject} from "./lib/init/_generic/preInitializeGenericProject.mjs"

import {initPackageProject} from "./lib/init/package-like/initPackageProject.mjs"
import {checkProjectPackageJSON} from "./checkProjectPackageJSON.mjs"
import {orderProjectPackageJSON} from "./orderProjectPackageJSON.mjs"

export async function getIntegrationAPIVersion() {
	return 0
}

export async function initializeProject(fourtune_session, writeFile) {
	await initializeGenericProject(fourtune_session, writeFile)
}

export async function preInitialize(
	fourtune_session,
	target_configuration,
	assets,
	source_files
) {
	const project_config = fourtune_session.getProjectConfig()

	await preInitializeGenericProject(fourtune_session, source_files)
}

export async function initialize(
	fourtune_session,
	target_configuration,
	assets,
	source_files
) {
	const project_config = fourtune_session.getProjectConfig()

	await checkProjectPackageJSON(fourtune_session)
	await orderProjectPackageJSON(fourtune_session)

	await initializeObjectCreation(fourtune_session)
	await autogenerateTSConfigFiles(fourtune_session)

	switch (project_config.realm.type) {
		case "package": {
			await initPackageProject(fourtune_session)
		} break

//		case "app": {
//			await initAppProject(context)
//		} break

//		case "class": {
//			await initClassProject(context)
//		} break

		default: {
			throw new Error(
				`Unknown target type '${project_config.realm.type}'.`
			)
		}
	}
}
