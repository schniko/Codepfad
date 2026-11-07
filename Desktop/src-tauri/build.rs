fn main() {
    let commands = tauri_build::AppManifest::new().commands(&[
        "save_project", "check_app_update", "install_app_update",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(commands))
        .expect("Tauri build configuration");
}
