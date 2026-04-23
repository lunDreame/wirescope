use crate::state::{Packet, SplitterConfig};
use crate::checksum;

pub struct Splitter {
    config: SplitterConfig,
    buf: Vec<u8>,
    in_packet: bool,
}

impl Splitter {
    /// Restore a persisted per-session splitter state.
    pub fn with_state(config: SplitterConfig, buf: Vec<u8>, in_packet: bool) -> Self {
        Self { config, buf, in_packet }
    }

    /// Extract buffer and parser state for persistence between data callbacks.
    pub fn into_state(self) -> (Vec<u8>, bool) {
        (self.buf, self.in_packet)
    }

    pub fn feed(&mut self, data: &[u8], direction: &str, timestamp_ms: f64, session_id: &str, next_id: &mut u64) -> Vec<Packet> {
        match self.config.method.as_str() {
            "delimiter" => self.feed_delimiter(data, direction, timestamp_ms, session_id, next_id),
            "length_field" => self.feed_length_field(data, direction, timestamp_ms, session_id, next_id),
            _ => {
                let pkt = self.make_packet(data.to_vec(), direction, timestamp_ms, session_id, next_id);
                vec![pkt]
            }
        }
    }

    fn feed_delimiter(&mut self, data: &[u8], direction: &str, ts: f64, sid: &str, next_id: &mut u64) -> Vec<Packet> {
        let mut packets = Vec::new();
        self.buf.extend_from_slice(data);

        let sof = self.config.sof.clone();
        let eof = self.config.eof.clone();

        loop {
            // ── Find packet start ──────────────────────────────────────────
            if !self.in_packet {
                if sof.is_empty() {
                    self.in_packet = true;
                    continue;
                }
                match find_seq(&self.buf, &sof) {
                    Some(pos) => {
                        // Discard bytes before SOF; SOF itself stays and becomes part of the packet
                        self.buf.drain(..pos);
                        self.in_packet = true;
                    }
                    None => {
                        // Keep last (sof.len - 1) bytes as potential partial SOF prefix
                        let keep = sof.len().saturating_sub(1);
                        if self.buf.len() > keep {
                            self.buf.drain(..self.buf.len() - keep);
                        }
                        break;
                    }
                }
            }

            // ── Find packet end ────────────────────────────────────────────
            if self.in_packet {
                if eof.is_empty() {
                    if sof.is_empty() {
                        // No delimiters at all – flush whole buffer as one packet
                        let payload = std::mem::take(&mut self.buf);
                        packets.push(self.make_packet(payload, direction, ts, sid, next_id));
                        self.in_packet = false;
                        break;
                    } else {
                        // SOF-only mode: the next SOF occurrence marks the end of this packet.
                        // Search for SOF starting after the current packet's SOF header.
                        let search_from = sof.len();
                        if self.buf.len() <= search_from {
                            break; // Need more data
                        }
                        match find_seq(&self.buf[search_from..], &sof) {
                            Some(rel) => {
                                let end = search_from + rel;
                                let payload: Vec<u8> = self.buf.drain(..end).collect();
                                packets.push(self.make_packet(payload, direction, ts, sid, next_id));
                                self.in_packet = false;
                                // Loop again to process the next SOF that's now at buf[0]
                            }
                            None => break, // Wait for the next SOF to arrive
                        }
                    }
                } else {
                    match find_seq(&self.buf, &eof) {
                        Some(pos) => {
                            let (payload_end, skip) = if self.config.eof_include {
                                (pos + eof.len(), 0)
                            } else {
                                (pos, eof.len())
                            };
                            let payload: Vec<u8> = self.buf.drain(..payload_end).collect();
                            // Discard EOF bytes when not included
                            let drop = skip.min(self.buf.len());
                            self.buf.drain(..drop);
                            packets.push(self.make_packet(payload, direction, ts, sid, next_id));
                            self.in_packet = false;
                        }
                        None => break, // Wait for EOF to arrive
                    }
                }
            }
        }
        packets
    }

    fn feed_length_field(&mut self, data: &[u8], direction: &str, ts: f64, sid: &str, next_id: &mut u64) -> Vec<Packet> {
        let mut packets = Vec::new();
        self.buf.extend_from_slice(data);
        let cfg = &self.config;
        let hdr_len = cfg.length_field_offset + cfg.length_field_size;

        loop {
            if self.buf.len() < hdr_len {
                break;
            }
            let len_bytes = &self.buf[cfg.length_field_offset..cfg.length_field_offset + cfg.length_field_size];
            let body_len = len_bytes.iter().fold(0usize, |a, &b| (a << 8) | b as usize);
            let total = if cfg.length_includes_header { body_len } else { hdr_len + body_len };
            if self.buf.len() < total {
                break;
            }
            let payload: Vec<u8> = self.buf.drain(..total).collect();
            let pkt = self.make_packet(payload, direction, ts, sid, next_id);
            packets.push(pkt);
        }
        packets
    }

    fn make_packet(&self, payload: Vec<u8>, direction: &str, timestamp_ms: f64, session_id: &str, next_id: &mut u64) -> Packet {
        let checksum_ok = self.verify_checksum(&payload);
        let id = *next_id;
        *next_id += 1;
        Packet {
            id,
            timestamp_ms,
            gap_ms: None,
            direction: direction.to_string(),
            bytes: payload,
            checksum_ok,
            session_id: session_id.to_string(),
        }
    }

    fn verify_checksum(&self, payload: &[u8]) -> Option<bool> {
        let algo = &self.config.checksum_algorithm;
        if algo == "none" || algo.is_empty() {
            return None;
        }
        let size = self.config.checksum_size;
        let offset = self.config.checksum_offset;
        if payload.len() < size {
            return Some(false);
        }
        let cs_start = if offset < 0 {
            payload.len().checked_sub((-offset) as usize)?
        } else {
            offset as usize
        };
        if cs_start + size > payload.len() {
            return Some(false);
        }
        // Optionally skip SOF bytes from the data range
        let data_start = if self.config.checksum_exclude_sof {
            self.config.sof.len().min(cs_start)
        } else {
            0
        };
        let data = &payload[data_start..cs_start];
        let expected = &payload[cs_start..cs_start + size];
        Some(checksum::verify(algo, data, expected))
    }
}

fn find_seq(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() {
        return Some(0);
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}
