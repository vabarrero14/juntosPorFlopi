// Tiene que coincidir exactamente con el email hardcodeado en
// firestore.rules (bootstrap del primer admin). Cambiar en un solo lugar
// no alcanza: hay que actualizar los dos y volver a deployar las reglas.
export const BOOTSTRAP_OWNER_EMAIL = "vabarreto14@gmail.com";
