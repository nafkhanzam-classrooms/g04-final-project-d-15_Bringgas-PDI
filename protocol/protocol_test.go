package protocol

import (
	"bytes"
	"testing"
)

func TestEncodeDecodePacket(t *testing.T) {
	msgType := MsgCreateClass
	seq := uint32(42)
	payload := []byte(`{"className": "Jaringan Komputer ITS", "hostName": "Pak Dosen"}`)

	// 1. Encode
	packet := EncodePacket(msgType, seq, payload)

	// 2. Decode
	decodedMsgType, decodedSeq, decodedPayload, err := DecodePacket(packet)
	if err != nil {
		t.Fatalf("Failed to decode packet: %v", err)
	}

	if decodedMsgType != msgType {
		t.Errorf("Expected msgType %v, got %v", msgType, decodedMsgType)
	}

	if decodedSeq != seq {
		t.Errorf("Expected seq %d, got %d", seq, decodedSeq)
	}

	if !bytes.Equal(decodedPayload, payload) {
		t.Errorf("Expected payload %s, got %s", string(payload), string(decodedPayload))
	}
}

func TestDecodeInvalidMagic(t *testing.T) {
	packet := EncodePacket(MsgJoinClass, 1, []byte("hello"))
	packet[0] = 0x00 // corrupt magic number

	_, _, _, err := DecodePacket(packet)
	if err == nil {
		t.Fatal("Expected error for invalid magic number, but got nil")
	}
}

func TestDecodeInvalidChecksum(t *testing.T) {
	packet := EncodePacket(MsgJoinClass, 1, []byte("hello"))
	// Payload is at index 13 to 18 (5 bytes). Checksum is at 18 to 22.
	// Corrupt payload
	packet[13] = 'x'

	_, _, _, err := DecodePacket(packet)
	if err == nil {
		t.Fatal("Expected error for invalid checksum, but got nil")
	}
}

func TestDecodeTooShort(t *testing.T) {
	_, _, _, err := DecodePacket([]byte{1, 2, 3})
	if err == nil {
		t.Fatal("Expected error for short packet, but got nil")
	}
}
