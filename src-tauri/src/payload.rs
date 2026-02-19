pub fn apply_append_mode(payload: String, append: &str) -> Vec<u8> {
    match append {
        "lf" => [payload.as_bytes(), b"\n"].concat(),
        "cr" => [payload.as_bytes(), b"\r"].concat(),
        "crlf" => [payload.as_bytes(), b"\r\n"].concat(),
        _ => payload.into_bytes(),
    }
}
