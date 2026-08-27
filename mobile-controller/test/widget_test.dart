import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_controller/core/models/controller_models.dart';

void main() {
  group('Controller Models & Serialization Tests', () {
    test('ControllerPacket serializes correctly to JSON', () {
      final packet = ControllerPacket(
        seq: 42,
        timestamp: 1724770000000,
        clientId: 'test-mobile',
        steer: -0.75,
        throttle: 0.85,
        brake: 0.0,
        buttonsDown: ['btn_engine'],
        buttonsUp: [],
      );

      final json = packet.toJson();

      expect(json['seq'], 42);
      expect(json['clientId'], 'test-mobile');
      expect(json['steer'], -0.75);
      expect(json['throttle'], 0.85);
      expect(json['brake'], 0.0);
      expect(json['buttonsDown'], contains('btn_engine'));
    });

    test('GameProfile deserialization parses default buttons', () {
      final map = {
        'id': 'ets2-test',
        'name': 'ETS2 Test',
        'description': 'Test profile',
        'buttons': [
          {
            'id': 'btn_engine',
            'label': 'ENGINE',
            'key': 'E',
            'type': 'toggle',
            'icon': 'power_settings_new',
            'category': 'drivetrain'
          }
        ]
      };

      final profile = GameProfile.fromJson(map);
      expect(profile.id, 'ets2-test');
      expect(profile.buttons.length, 1);
      expect(profile.buttons.first.key, 'E');
      expect(profile.buttons.first.type, 'toggle');
    });
  });
}
