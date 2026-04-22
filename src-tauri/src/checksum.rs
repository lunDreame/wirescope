use crc::{Crc, CRC_16_MODBUS, CRC_16_IBM_3740, CRC_16_KERMIT, CRC_32_ISO_HDLC};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChecksumResult {
    pub algorithm: String,
    pub value: u64,
    pub hex: String,
}

pub fn compute(algo: &str, data: &[u8]) -> u64 {
    match algo {
        "crc16-modbus" => Crc::<u16>::new(&CRC_16_MODBUS).checksum(data) as u64,
        "crc16-ccitt" => Crc::<u16>::new(&CRC_16_IBM_3740).checksum(data) as u64,
        "crc16-kermit" => Crc::<u16>::new(&CRC_16_KERMIT).checksum(data) as u64,
        "crc32" => Crc::<u32>::new(&CRC_32_ISO_HDLC).checksum(data) as u64,
        "sum8" => data.iter().fold(0u64, |a, &b| a.wrapping_add(b as u64)) & 0xFF,
        "xor" => data.iter().fold(0u64, |a, &b| a ^ b as u64) & 0xFF,
        "fletcher16" => {
            let (mut a, mut b) = (0u16, 0u16);
            for &byte in data {
                a = (a + byte as u16) % 255;
                b = (b + a) % 255;
            }
            ((b as u64) << 8) | a as u64
        }
        _ => 0,
    }
}

pub fn compute_all(data: &[u8]) -> Vec<ChecksumResult> {
    let algos = [
        ("crc16-modbus", 4),
        ("crc16-ccitt", 4),
        ("crc16-kermit", 4),
        ("crc32", 8),
        ("sum8", 2),
        ("xor", 2),
        ("fletcher16", 4),
    ];
    algos.iter().map(|(algo, width)| {
        let v = compute(algo, data);
        ChecksumResult {
            algorithm: algo.to_string(),
            value: v,
            hex: format!("{v:0>width$X}"),
        }
    }).collect()
}

pub fn verify(algo: &str, payload: &[u8], expected_bytes: &[u8]) -> bool {
    let computed = compute(algo, payload);
    let expected = expected_bytes.iter().fold(0u64, |a, &b| (a << 8) | b as u64);
    computed == expected
}
