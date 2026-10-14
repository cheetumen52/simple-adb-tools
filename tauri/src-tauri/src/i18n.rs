//! Language of user-facing backend messages; the frontend sets it on start and on every switch.

use std::sync::atomic::{AtomicBool, Ordering};

static ENGLISH: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_locale(lang: String) {
    ENGLISH.store(lang != "cs", Ordering::Relaxed);
}

/// Picks the Czech or English variant of a message.
pub fn tr<T>(cs: T, en: T) -> T {
    if ENGLISH.load(Ordering::Relaxed) {
        en
    } else {
        cs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follows_the_selected_language() {
        set_locale("en".into());
        assert_eq!(tr("ahoj", "hello"), "hello");
        set_locale("cs".into());
        assert_eq!(tr("ahoj", "hello"), "ahoj");
    }
}
